/**
 * 付款单的读写与凭证生成（V13-C3/C4/C5/C6）。
 *
 * 只管结算性付款（报销 / 合同期次）。借款付款是资产内部转移、方向不同，
 * 走 `advances/payment.ts`——理由见迁移 088 的文件头。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { fromCents } from "../../utils/money.js";
import { buildPaymentLines, type PaymentTarget } from "./voucher.js";

export type PaymentStatus = "draft" | "submitted" | "paid" | "cancelled";

export interface PaymentRow {
  id: string;
  companyId: string;
  paymentNo: string;
  reimbursementId: string | null;
  scheduleId: string | null;
  amountCents: number;
  paidOn: string;
  bankAccountCode: string;
  status: PaymentStatus;
  voucherId: string | null;
  exportBatchNo: string | null;
  note: string | null;
}

export type PaymentFailureCode =
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_AMOUNT_INVALID"
  | "PAYMENT_TARGET_INVALID"
  | "PAYMENT_EXCEEDS_REMAINING"
  | "PAYMENT_INVALID_TRANSITION";

export type PaymentResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: PaymentFailureCode; message: string } };

interface PaymentDbRow {
  id: string;
  company_id: string;
  payment_no: string;
  reimbursement_id: string | null;
  schedule_id: string | null;
  amount_cents: string;
  paid_on: string | Date;
  bank_account_code: string;
  status: PaymentStatus;
  voucher_id: string | null;
  export_batch_no: string | null;
  note: string | null;
}

function asDate(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: PaymentDbRow): PaymentRow {
  return {
    id: row.id,
    companyId: row.company_id,
    paymentNo: row.payment_no,
    reimbursementId: row.reimbursement_id,
    scheduleId: row.schedule_id,
    amountCents: Number(row.amount_cents),
    paidOn: asDate(row.paid_on),
    bankAccountCode: row.bank_account_code,
    status: row.status,
    voucherId: row.voucher_id,
    exportBatchNo: row.export_batch_no,
    note: row.note
  };
}

const COLUMNS = `
  id, company_id, payment_no, reimbursement_id, schedule_id, amount_cents,
  paid_on, bank_account_code, status, voucher_id, export_batch_no, note
`;

export async function getPayment(companyId: string, id: string): Promise<PaymentRow | null> {
  const row = await queryOne<PaymentDbRow>(
    `select ${COLUMNS} from payments where company_id = $1 and id = $2`,
    [companyId, id]
  );
  return row ? mapRow(row) : null;
}

export async function listPayments(
  companyId: string,
  filter: { status?: PaymentStatus; from?: string; to?: string } = {}
): Promise<PaymentRow[]> {
  const conditions = ["company_id = $1"];
  const params: unknown[] = [companyId];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.from) {
    params.push(filter.from);
    conditions.push(`paid_on >= $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    conditions.push(`paid_on <= $${params.length}`);
  }
  const rows = await query<PaymentDbRow>(
    `select ${COLUMNS} from payments where ${conditions.join(" and ")} order by paid_on desc, payment_no desc`,
    params
  );
  return rows.map(mapRow);
}

export interface CreatePaymentInput {
  companyId: string;
  reimbursementId: string | null;
  scheduleId: string | null;
  amountCents: number;
  paidOn: string;
  bankAccountCode: string;
  createdByUserId: string;
  note: string | null;
}

/** 某期次/某报销单还剩多少没付。已付部分只算 `paid` 状态的付款单。 */
async function remainingCents(
  tx: { query: <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  input: { scheduleId: string | null; reimbursementId: string | null }
): Promise<number | null> {
  if (input.scheduleId) {
    const rows = await tx.query<{ amount_cents: string; paid: string }>(
      `select s.amount_cents,
              coalesce((select sum(p.amount_cents) from payments p
                         where p.schedule_id = s.id and p.status = 'paid'), 0) as paid
         from contract_payment_schedules s where s.id = $1`,
      [input.scheduleId]
    );
    const row = rows.rows[0];
    return row ? Number(row.amount_cents) - Number(row.paid) : null;
  }

  if (input.reimbursementId) {
    // 报销合计由明细算——与报销模块同一口径，这里不能读一个不存在的 total 列。
    const rows = await tx.query<{ total: string; paid: string }>(
      `select coalesce((select sum(l.amount_cents) from reimbursement_lines l
                         where l.reimbursement_id = $1), 0) as total,
              coalesce((select sum(p.amount_cents) from payments p
                         where p.reimbursement_id = $1 and p.status = 'paid'), 0) as paid`,
      [input.reimbursementId]
    );
    const row = rows.rows[0];
    return row ? Number(row.total) - Number(row.paid) : null;
  }

  return null;
}

export async function createPayment(
  input: CreatePaymentInput
): Promise<PaymentResult<PaymentRow>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return {
      ok: false,
      failure: { code: "PAYMENT_AMOUNT_INVALID", message: "付款金额必须是正整数分" }
    };
  }
  const targetCount = (input.reimbursementId ? 1 : 0) + (input.scheduleId ? 1 : 0);
  if (targetCount !== 1) {
    return {
      ok: false,
      failure: {
        code: "PAYMENT_TARGET_INVALID",
        message: "付款单必须且只能指向一个对象：报销单或合同期次"
      }
    };
  }

  return withTransaction(async (tx) => {
    // 超付拦截。**允许等额但不允许超额**：超付通常是含税不含税弄错或
    // 多转了一笔，在付出去之前拦住比事后红冲便宜得多。
    const remaining = await remainingCents(tx, input);
    if (remaining !== null && input.amountCents > remaining) {
      return {
        ok: false as const,
        failure: {
          code: "PAYMENT_EXCEEDS_REMAINING" as const,
          message: `本次付款 ${fromCents(input.amountCents)} 元超过未付余额 ${fromCents(remaining)} 元。`
        }
      };
    }

    const yearMonth = input.paidOn.slice(0, 7).replace("-", "");
    const counted = await tx.query<{ count: string }>(
      `select count(*) as count from payments where company_id = $1 and payment_no like $2`,
      [input.companyId, `PAY-${yearMonth}-%`]
    );
    const paymentNo = `PAY-${yearMonth}-${String(Number(counted.rows[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const inserted = await tx.query<PaymentDbRow>(
      `insert into payments
         (id, company_id, payment_no, reimbursement_id, schedule_id, amount_cents,
          paid_on, bank_account_code, created_by_user_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${COLUMNS}`,
      [
        `pay-${randomUUID()}`,
        input.companyId,
        paymentNo,
        input.reimbursementId,
        input.scheduleId,
        input.amountCents,
        input.paidOn,
        input.bankAccountCode,
        input.createdByUserId,
        input.note
      ]
    );
    return { ok: true as const, value: mapRow(inserted.rows[0]!) };
  });
}

/** 付款对象的展示标识与往来单位，供凭证摘要与分录使用。 */
async function resolveTarget(payment: PaymentRow): Promise<PaymentTarget | null> {
  if (payment.reimbursementId) {
    const row = await queryOne<{ reimbursement_no: string; counterparty_id: string }>(
      `select reimbursement_no, counterparty_id from reimbursements where id = $1`,
      [payment.reimbursementId]
    );
    return row
      ? { kind: "reimbursement", label: row.reimbursement_no, counterpartyId: row.counterparty_id }
      : null;
  }

  if (payment.scheduleId) {
    const row = await queryOne<{
      contract_no: string;
      period_no: number;
      title: string;
      counterparty_id: string | null;
      counterparty_name: string;
    }>(
      `select c.contract_no, s.period_no, s.title, c.counterparty_name,
              (select cp.id from counterparties cp
                where cp.company_id = c.company_id and cp.name = c.counterparty_name
                limit 1) as counterparty_id
         from contract_payment_schedules s
         join contracts c on c.id = s.contract_id
        where s.id = $1`,
      [payment.scheduleId]
    );
    if (!row) return null;
    return {
      kind: "schedule",
      label: `${row.contract_no} 第 ${row.period_no} 期 ${row.title}`,
      // 合同上只有对方名称没有往来单位 id——按名称反查，查不到就留空。
      // **不自动建档**：供应商往来单位应当由采购/财务正式建立，
      // 付款时顺手创建会让往来档案变成一堆重名近似项。
      counterpartyId: row.counterparty_id ?? ""
    };
  }

  return null;
}

/**
 * 确认付款：生成凭证草稿并把状态推进到 `paid`。
 *
 * 幂等：已有凭证的付款单直接返回那一张。重试不能生成第二张——
 * 两张一模一样的付款凭证过账后，银行存款会被扣两次。
 */
export async function confirmPayment(
  companyId: string,
  id: string
): Promise<PaymentResult<{ payment: PaymentRow; voucherId: string }>> {
  const payment = await getPayment(companyId, id);
  if (!payment) {
    return { ok: false, failure: { code: "PAYMENT_NOT_FOUND", message: "付款单不存在" } };
  }
  if (payment.status === "cancelled") {
    return {
      ok: false,
      failure: { code: "PAYMENT_INVALID_TRANSITION", message: "已作废的付款单不能确认" }
    };
  }
  if (payment.voucherId) {
    return { ok: true, value: { payment, voucherId: payment.voucherId } };
  }

  const target = await resolveTarget(payment);
  if (!target) {
    return {
      ok: false,
      failure: { code: "PAYMENT_TARGET_INVALID", message: "付款对象已不存在" }
    };
  }

  const voucherId = `vch-pay-${randomUUID()}`;
  await withTransaction(async (tx) => {
    const accounts = await tx.query<{ code: string; name: string }>(
      `select code, name from accounts where company_id = $1`,
      [companyId]
    );
    const nameOf = new Map(accounts.rows.map((row) => [row.code, row.name]));

    await tx.query(
      `insert into vouchers
         (id, company_id, voucher_type, summary, status, source, accounting_date, period)
       values ($1, $2, 'payment', $3, 'draft', 'manual', $4::date, $5)`,
      [
        voucherId,
        companyId,
        `${payment.paymentNo} ${target.label}`,
        payment.paidOn,
        payment.paidOn.slice(0, 7)
      ]
    );

    const lines = buildPaymentLines(
      {
        amountCents: payment.amountCents,
        bankAccountCode: payment.bankAccountCode,
        target
      },
      nameOf
    );
    for (const [index, line] of lines.entries()) {
      await tx.query(
        `insert into voucher_lines
           (id, company_id, voucher_id, sort_order, summary, account_code, account_name,
            debit, credit, counterparty_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `vl-${randomUUID()}`,
          companyId,
          voucherId,
          index,
          line.summary,
          line.accountCode,
          line.accountName,
          fromCents(line.debitCents),
          fromCents(line.creditCents),
          // 空串表示查不到往来单位，写 null 而不是空串——空串会在账龄表上
          // 变成一个名字为空的往来户。
          line.counterpartyId || null
        ]
      );
    }

    await tx.query(
      `update payments set status = 'paid', voucher_id = $3, updated_at = now()
        where company_id = $1 and id = $2`,
      [companyId, id, voucherId]
    );
  });

  return {
    ok: true,
    value: { payment: { ...payment, status: "paid", voucherId }, voucherId }
  };
}

/**
 * 打上导出批次号。
 *
 * 导出本身是纯计算（`voucher.ts` 的 `toBankCsv`），这里只记录「哪些付款单
 * 属于哪一批」——对账时要能反查「这笔是哪次导出的」。
 */
export async function markExported(
  companyId: string,
  ids: readonly string[],
  batchNo: string
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await query<{ id: string }>(
    `update payments set export_batch_no = $3, updated_at = now()
      where company_id = $1 and id = any($2::text[])
      returning id`,
    [companyId, ids, batchNo]
  );
  return rows.length;
}
