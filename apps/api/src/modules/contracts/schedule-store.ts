/**
 * 合同付款计划的读写（V13-C1/C2/C5）。
 *
 * **累计已付由付款单实时汇总**，不存字段。期次状态同样由已付金额推导
 *（`payment-schedule.ts` 的纯函数）——这里只负责取数与落库。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import {
  contractPaymentProgress,
  scheduleStatus,
  type ContractPaymentProgress,
  type PaymentScheduleRow,
  type PaymentScheduleStatus,
  type PaymentScheduleType
} from "./payment-schedule.js";

interface ScheduleDbRow {
  id: string;
  contract_id: string;
  period_no: number;
  title: string;
  due_date: string | Date;
  amount_cents: string;
  ratio_bp: number | null;
  schedule_type: PaymentScheduleType;
  retention_release_date: string | Date | null;
  is_cancelled: boolean;
  note: string | null;
}

function asDate(value: string | Date | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: ScheduleDbRow): PaymentScheduleRow & { ratioBp: number | null; note: string | null } {
  return {
    id: row.id,
    contractId: row.contract_id,
    periodNo: row.period_no,
    title: row.title,
    dueDate: asDate(row.due_date)!,
    amountCents: Number(row.amount_cents),
    scheduleType: row.schedule_type,
    retentionReleaseDate: asDate(row.retention_release_date),
    isCancelled: row.is_cancelled,
    ratioBp: row.ratio_bp,
    note: row.note
  };
}

const COLUMNS = `
  id, contract_id, period_no, title, due_date, amount_cents, ratio_bp,
  schedule_type, retention_release_date, is_cancelled, note
`;

/**
 * 某合同的各期累计已付（分）。
 *
 * 只算 `paid` 状态的付款单：草稿与已作废的不算——把草稿算进去会让
 * 「已付」在钱还没出去时就跳数。
 */
export async function loadPaidByScheduleId(contractId: string): Promise<Map<string, number>> {
  const rows = await query<{ schedule_id: string; total: string }>(
    `select p.schedule_id, coalesce(sum(p.amount_cents), 0) as total
       from payments p
       join contract_payment_schedules s on s.id = p.schedule_id
      where s.contract_id = $1 and p.status = 'paid'
      group by p.schedule_id`,
    [contractId]
  );
  return new Map(rows.map((row) => [row.schedule_id, Number(row.total)]));
}

export interface ScheduleWithStatus extends PaymentScheduleRow {
  ratioBp: number | null;
  note: string | null;
  paidCents: number;
  status: PaymentScheduleStatus;
}

export async function listSchedules(
  companyId: string,
  contractId: string,
  today?: string
): Promise<{ items: ScheduleWithStatus[]; progress: ContractPaymentProgress }> {
  const rows = await query<ScheduleDbRow>(
    `select ${COLUMNS} from contract_payment_schedules
      where company_id = $1 and contract_id = $2 order by period_no`,
    [companyId, contractId]
  );
  const schedules = rows.map(mapRow);
  const paid = await loadPaidByScheduleId(contractId);

  return {
    items: schedules.map((schedule) => ({
      ...schedule,
      paidCents: paid.get(schedule.id) ?? 0,
      status: scheduleStatus(schedule, paid.get(schedule.id) ?? 0, today)
    })),
    progress: contractPaymentProgress(schedules, paid)
  };
}

export interface CreateScheduleInput {
  companyId: string;
  contractId: string;
  periodNo: number;
  title: string;
  dueDate: string;
  amountCents: number;
  ratioBp: number | null;
  scheduleType: PaymentScheduleType;
  retentionReleaseDate: string | null;
  note: string | null;
}

export type ScheduleFailureCode =
  | "SCHEDULE_NOT_FOUND"
  | "SCHEDULE_AMOUNT_INVALID"
  | "SCHEDULE_PERIOD_DUPLICATE"
  | "SCHEDULE_RETENTION_DATE_INVALID"
  | "SCHEDULE_HAS_PAYMENT";

export type ScheduleResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: ScheduleFailureCode; message: string } };

const UNIQUE_VIOLATION = "23505";

export async function createSchedule(
  input: CreateScheduleInput
): Promise<ScheduleResult<ScheduleWithStatus>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return {
      ok: false,
      failure: { code: "SCHEDULE_AMOUNT_INVALID", message: "期次金额必须是非负整数分" }
    };
  }
  // 库上有 CHECK 兜底，这里先判是为了给出看得懂的话。
  if (input.scheduleType !== "retention" && input.retentionReleaseDate !== null) {
    return {
      ok: false,
      failure: {
        code: "SCHEDULE_RETENTION_DATE_INVALID",
        message: "只有质保金期次能设置释放日期"
      }
    };
  }

  const id = `cps-${randomUUID()}`;
  try {
    const row = await queryOne<ScheduleDbRow>(
      `insert into contract_payment_schedules
         (id, company_id, contract_id, period_no, title, due_date, amount_cents,
          ratio_bp, schedule_type, retention_release_date, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning ${COLUMNS}`,
      [
        id,
        input.companyId,
        input.contractId,
        input.periodNo,
        input.title,
        input.dueDate,
        input.amountCents,
        input.ratioBp,
        input.scheduleType,
        input.retentionReleaseDate,
        input.note
      ]
    );
    const mapped = mapRow(row!);
    return {
      ok: true,
      value: { ...mapped, paidCents: 0, status: scheduleStatus(mapped, 0) }
    };
  } catch (error) {
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return {
        ok: false,
        failure: {
          code: "SCHEDULE_PERIOD_DUPLICATE",
          message: `第 ${input.periodNo} 期已存在。改那一期，而不是新建。`
        }
      };
    }
    throw error;
  }
}

/**
 * 作废一期。
 *
 * 已有付款的期次不能作废——那些钱已经付出去了，作废会让合同的已付合计
 * 凭空少一块，而账上的付款凭证还在。
 */
export async function cancelSchedule(
  companyId: string,
  id: string
): Promise<ScheduleResult<{ id: string }>> {
  return withTransaction(async (tx) => {
    const paid = await tx.query<{ count: string }>(
      `select count(*) as count from payments where schedule_id = $1 and status = 'paid'`,
      [id]
    );
    if (Number(paid.rows[0]?.count ?? 0) > 0) {
      return {
        ok: false as const,
        failure: {
          code: "SCHEDULE_HAS_PAYMENT" as const,
          message: "该期次已有付款记录，不能作废。如需调整请新增一期冲抵。"
        }
      };
    }

    const updated = await tx.query(
      `update contract_payment_schedules set is_cancelled = true, updated_at = now()
        where company_id = $1 and id = $2`,
      [companyId, id]
    );
    if (updated.rowCount === 0) {
      return {
        ok: false as const,
        failure: { code: "SCHEDULE_NOT_FOUND" as const, message: "期次不存在" }
      };
    }
    return { ok: true as const, value: { id } };
  });
}

export interface DuePaymentRow {
  scheduleId: string;
  contractId: string;
  contractNo: string;
  counterpartyName: string;
  periodNo: number;
  title: string;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  scheduleType: PaymentScheduleType;
}

/**
 * 某段时间内到期的付款（C7「本月应付」）。
 *
 * **只返回没付清的**：已付清的期次出现在「应付」列表里，出纳会重复付款。
 * 这个查询是出纳每天要看的第一个东西。
 */
export async function listDuePayments(
  companyId: string,
  range: { from: string; to: string }
): Promise<DuePaymentRow[]> {
  const rows = await query<{
    schedule_id: string;
    contract_id: string;
    contract_no: string;
    counterparty_name: string;
    period_no: number;
    title: string;
    due_date: string | Date;
    amount_cents: string;
    paid_cents: string;
    schedule_type: PaymentScheduleType;
  }>(
    `select s.id as schedule_id, s.contract_id, c.contract_no, c.counterparty_name,
            s.period_no, s.title, s.due_date, s.amount_cents, s.schedule_type,
            coalesce((
              select sum(p.amount_cents) from payments p
               where p.schedule_id = s.id and p.status = 'paid'
            ), 0) as paid_cents
       from contract_payment_schedules s
       join contracts c on c.id = s.contract_id
      where s.company_id = $1
        and not s.is_cancelled
        and s.due_date >= $2 and s.due_date <= $3
      order by s.due_date, c.contract_no, s.period_no`,
    [companyId, range.from, range.to]
  );

  return rows
    .map((row) => ({
      scheduleId: row.schedule_id,
      contractId: row.contract_id,
      contractNo: row.contract_no,
      counterpartyName: row.counterparty_name,
      periodNo: row.period_no,
      title: row.title,
      dueDate: asDate(row.due_date)!,
      amountCents: Number(row.amount_cents),
      paidCents: Number(row.paid_cents),
      scheduleType: row.schedule_type
    }))
    // 已付清的不出现在应付列表里——出纳看到它会重复付款。
    .filter((row) => row.paidCents < row.amountCents);
}
