/**
 * P3 工资代发引擎
 *
 * 流程：从已确认工资记录生成代发批次 → 审批 → 导出银行代发文件 →
 *       标记已代发（联动经营事项）→ 后续与银行流水对账确认
 *
 * 状态机：draft → approved → exported → disbursed → confirmed
 */

import { query, queryOne, withTransaction } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import {
  buildTransferFile,
  type TransferFileFormat,
  type TransferFileResult,
  type TransferLine,
} from "./transfer-file.js";

interface BatchRow {
  id: string;
  company_id: string;
  payroll_period: string;
  bank_account_id: string | null;
  bank_statement_id: string | null;
  total_amount: string;
  employee_count: number;
  status: string;
  retry_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  compensation_status: string;
  compensation_event_id: string | null;
  compensated_at: string | null;
  bank_transfer_ref: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface LineRow {
  id: string;
  employee_id: string;
  employee_name: string;
  salary_account: string;
  salary_bank: string;
  amount: string;
  status: string;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildPayrollDisbursedDescription(batch: BatchRow, batchId: string, bankTransferRef?: string) {
  return `代发批次 ${batchId} 已完成，${batch.employee_count} 人，合计 ¥${Number(batch.total_amount).toFixed(2)}${bankTransferRef ? `，银行批次号 ${bankTransferRef}` : ""}`;
}

async function recordCompensationFailure(companyId: string, batchId: string, message: string) {
  await query(
    `update payroll_transfer_batches
     set compensation_status = 'failed',
         last_error = $3,
         last_attempt_at = now(),
         next_retry_at = now() + interval '15 minutes',
         updated_at = now()
     where id = $1 and company_id = $2`,
    [batchId, companyId, message]
  );
}

// ── 1. 从已确认工资生成代发批次 ───────────────────────────────────────────────

export async function buildBatchFromPayroll(
  companyId: string,
  period: string,
  options: { bankAccountId?: string } = {},
): Promise<{ batchId: string; employeeCount: number; totalAmount: number; skipped: number }> {
  // 取该期已确认工资记录 + 员工账号快照
  const records = await query<{
    employee_id: string; employee_name: string; net_pay: string;
    salary_account: string; salary_bank: string;
  }>(
    `SELECT pr.employee_id, pr.employee_name, pr.net_pay,
            coalesce(e.salary_account,'') as salary_account,
            coalesce(e.salary_bank,'')    as salary_bank
     FROM payroll_records pr
     LEFT JOIN employees e ON e.id = pr.employee_id
     WHERE pr.company_id = $1 AND pr.period = $2 AND pr.status = 'confirmed'`,
    [companyId, period],
  );

  if (records.length === 0) {
    throw new Error(`期间 ${period} 没有已确认的工资记录，无法生成代发批次`);
  }

  const lines: { line: TransferLine; employeeId: string; status: "normal" | "skipped" }[] =
    records.map((r) => ({
      employeeId: r.employee_id,
      status: r.salary_account.trim() ? "normal" : "skipped",
      line: {
        employeeName: r.employee_name,
        salaryAccount: r.salary_account,
        salaryBank: r.salary_bank,
        amount: Number(r.net_pay),
      },
    }));

  const normalLines = lines.filter((l) => l.status === "normal");
  const totalAmount = Number(normalLines.reduce((s, l) => s + l.line.amount, 0).toFixed(2));
  const skipped = lines.length - normalLines.length;

  const batchId = await withTransaction(async (tx) => {
    // 同期已存在批次则替换（仅当其仍为 draft，避免覆盖已审批/已代发批次）
    const existing = await tx.query<{ id: string; status: string }>(
      "SELECT id, status FROM payroll_transfer_batches WHERE company_id=$1 AND payroll_period=$2",
      [companyId, period],
    );
    const prev = existing.rows[0];
    if (prev && prev.status !== "draft") {
      throw new Error(`期间 ${period} 的代发批次已是「${prev.status}」状态，不可重建`);
    }

    const id = prev?.id ?? genId("ptb");
    if (prev) {
      await tx.query("DELETE FROM payroll_transfer_lines WHERE batch_id=$1", [id]);
      await tx.query(
        `UPDATE payroll_transfer_batches
         SET total_amount=$1, employee_count=$2, bank_account_id=$3, updated_at=now()
         WHERE id=$4`,
        [totalAmount, normalLines.length, options.bankAccountId ?? null, id],
      );
    } else {
      await tx.query(
        `INSERT INTO payroll_transfer_batches
           (id, company_id, payroll_period, bank_account_id, total_amount, employee_count, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',now(),now())`,
        [id, companyId, period, options.bankAccountId ?? null, totalAmount, normalLines.length],
      );
    }

    for (const l of lines) {
      await tx.query(
        `INSERT INTO payroll_transfer_lines
           (id, batch_id, company_id, employee_id, employee_name, salary_account, salary_bank, amount, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
        [genId("ptl"), id, companyId, l.employeeId, l.line.employeeName,
         l.line.salaryAccount, l.line.salaryBank, l.line.amount, l.status],
      );
    }
    return id;
  });

  writeAudit({
    companyId, action: "payroll.transfer.batch_built",
    resourceType: "payroll_transfer_batch", resourceId: batchId, resourceLabel: period,
    changes: { employeeCount: normalLines.length, totalAmount, skipped },
  });

  return { batchId, employeeCount: normalLines.length, totalAmount, skipped };
}

// ── 2. 查询 ───────────────────────────────────────────────────────────────────

export async function listBatches(companyId: string) {
  return query<BatchRow>(
    `SELECT * FROM payroll_transfer_batches WHERE company_id=$1 ORDER BY payroll_period DESC`,
    [companyId],
  );
}

export async function getBatchWithLines(companyId: string, batchId: string) {
  const batch = await queryOne<BatchRow>(
    "SELECT * FROM payroll_transfer_batches WHERE id=$1 AND company_id=$2",
    [batchId, companyId],
  );
  if (!batch) return null;
  const lines = await query<LineRow>(
    "SELECT id, employee_id, employee_name, salary_account, salary_bank, amount, status FROM payroll_transfer_lines WHERE batch_id=$1 ORDER BY status, employee_name",
    [batchId],
  );
  return { batch, lines };
}

// ── 3. 审批 ───────────────────────────────────────────────────────────────────

export async function approveBatch(companyId: string, batchId: string, userId: string) {
  const batch = await queryOne<{ status: string }>(
    "SELECT status FROM payroll_transfer_batches WHERE id=$1 AND company_id=$2",
    [batchId, companyId],
  );
  if (!batch) throw new Error("代发批次不存在");
  if (batch.status !== "draft") throw new Error(`仅草稿状态可审批，当前为「${batch.status}」`);

  await query(
    "UPDATE payroll_transfer_batches SET status='approved', approved_by=$1, approved_at=now(), updated_at=now() WHERE id=$2",
    [userId, batchId],
  );
  writeAudit({
    companyId, userId, action: "payroll.transfer.batch_approved",
    resourceType: "payroll_transfer_batch", resourceId: batchId,
  });
}

// ── 4. 生成代发文件（导出）────────────────────────────────────────────────────

export async function generateBatchFile(
  companyId: string, batchId: string, format: TransferFileFormat,
): Promise<TransferFileResult> {
  const data = await getBatchWithLines(companyId, batchId);
  if (!data) throw new Error("代发批次不存在");
  if (data.batch.status === "draft") {
    throw new Error("批次尚未审批，请先审批再导出代发文件");
  }

  const transferLines: TransferLine[] = data.lines
    .filter((l) => l.status === "normal")
    .map((l) => ({
      employeeName: l.employee_name,
      salaryAccount: l.salary_account,
      salaryBank: l.salary_bank,
      amount: Number(l.amount),
    }));

  const file = buildTransferFile(transferLines, data.batch.payroll_period, format);

  // 首次导出推进到 exported
  if (data.batch.status === "approved") {
    await query(
      `UPDATE payroll_transfer_batches
       SET status='exported',
           exported_at=now(),
           last_error=null,
           last_attempt_at=now(),
           next_retry_at=null,
           compensation_status='not_required',
           compensation_event_id=null,
           compensated_at=null,
           updated_at=now()
       WHERE id=$1`,
      [batchId],
    );
  }
  writeAudit({
    companyId, action: "payroll.transfer.file_generated",
    resourceType: "payroll_transfer_batch", resourceId: batchId,
    changes: { format, lineCount: file.lineCount, totalAmount: file.totalAmount },
  });
  return file;
}

// ── 5. 标记已代发（联动经营事项）──────────────────────────────────────────────

export async function markDisbursed(
  companyId: string, batchId: string, userId: string, bankTransferRef?: string,
) {
  try {
    const result = await withTransaction(async (tx) => {
      const batchRows = await tx.query<BatchRow>(
        "SELECT * FROM payroll_transfer_batches WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [batchId, companyId]
      );
      const batch = batchRows.rows[0];
      if (!batch) throw new Error("代发批次不存在");
      if (
        ["disbursed", "confirmed"].includes(batch.status) &&
        batch.compensation_status === "completed" &&
        batch.compensation_event_id
      ) {
        return { eventId: batch.compensation_event_id, reused: true };
      }
      if (batch.status !== "exported") {
        throw new Error(`仅已导出批次可标记代发完成，当前为「${batch.status}」`);
      }

      const eventId = genId("evt-pay");
      const now = new Date().toISOString();
      await tx.query(
        `UPDATE payroll_transfer_batches
         SET status='disbursed',
             disbursed_at=now(),
             bank_transfer_ref=$1,
             compensation_status='pending',
             last_error=null,
             last_attempt_at=now(),
             next_retry_at=null,
             updated_at=now()
         WHERE id=$2`,
        [bankTransferRef ?? null, batchId],
      );
      await tx.query(
        `INSERT INTO business_events
           (id, company_id, type, title, description, department, occurred_on,
            amount, currency, status, source, created_at, updated_at)
         VALUES ($1,$2,'payroll_disbursed',$3,$4,'财务',$5,$6,'CNY','analyzed','integration',$7,$7)`,
        [
          eventId,
          companyId,
          `${batch.payroll_period} 工资代发完成`,
          buildPayrollDisbursedDescription(batch, batchId, bankTransferRef),
         `${batch.payroll_period}-01`,
          batch.total_amount,
          now,
        ],
      );
      await tx.query(
        `UPDATE payroll_transfer_batches
         SET compensation_status='completed',
             compensation_event_id=$1,
             compensated_at=now(),
             updated_at=now()
         WHERE id=$2`,
        [eventId, batchId]
      );
      return { eventId, reused: false };
    });

    if (!result.reused) {
      writeAudit({
        companyId, userId, action: "payroll.transfer.disbursed",
        resourceType: "payroll_transfer_batch", resourceId: batchId,
        changes: { bankTransferRef, eventId: result.eventId },
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "工资代发补偿联动失败";
    await recordCompensationFailure(companyId, batchId, message);
    throw error;
  }
}

export async function compensateDisbursedBatch(companyId: string, batchId: string, userId: string) {
  try {
    const result = await withTransaction(async (tx) => {
      const batchRows = await tx.query<BatchRow>(
        "SELECT * FROM payroll_transfer_batches WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [batchId, companyId]
      );
      const batch = batchRows.rows[0];
      if (!batch) throw new Error("代发批次不存在");
      if (!["disbursed", "confirmed"].includes(batch.status)) {
        throw new Error(`仅已代发批次可执行补偿，当前为「${batch.status}」`);
      }
      if (batch.compensation_status === "completed" && batch.compensation_event_id) {
        return { eventId: batch.compensation_event_id, reused: true };
      }

      const eventId = genId("evt-pay");
      const now = new Date().toISOString();
      await tx.query(
        `INSERT INTO business_events
           (id, company_id, type, title, description, department, occurred_on,
            amount, currency, status, source, created_at, updated_at)
         VALUES ($1,$2,'payroll_disbursed',$3,$4,'财务',$5,$6,'CNY','analyzed','integration',$7,$7)`,
        [
          eventId,
          companyId,
          `${batch.payroll_period} 工资代发完成（补偿）`,
          buildPayrollDisbursedDescription(batch, batchId, batch.bank_transfer_ref ?? undefined),
          `${batch.payroll_period}-01`,
          batch.total_amount,
          now
        ]
      );
      await tx.query(
        `UPDATE payroll_transfer_batches
         SET compensation_status='completed',
             compensation_event_id=$1,
             compensated_at=now(),
             retry_count=retry_count + 1,
             last_error=null,
             last_attempt_at=now(),
             next_retry_at=null,
             updated_at=now()
         WHERE id=$2`,
        [eventId, batchId]
      );
      return { eventId, reused: false };
    });

    if (!result.reused) {
      writeAudit({
        companyId,
        userId,
        action: "payroll.transfer.compensated",
        resourceType: "payroll_transfer_batch",
        resourceId: batchId,
        changes: { eventId: result.eventId }
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "工资代发补偿联动失败";
    await recordCompensationFailure(companyId, batchId, message);
    throw error;
  }
}
