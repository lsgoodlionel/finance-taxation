/**
 * 验收单的读写与三单匹配取数（V13 残留 7）。
 *
 * 匹配判断在 `three-way-match.ts`（纯函数），这里负责把三个数凑齐：
 * 期次约定、累计已验收、累计已开票。
 *
 * **累计已验收不存在合同或期次上**——由本表按 `confirmed` 状态汇总，
 * 与报销合计、借款余额、合同累计已付同一原则。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne } from "../../db/client.js";
import { toCents } from "../../utils/money.js";
import type { ControlCheckResult } from "../controls/result.js";
import { matchThreeWay } from "./three-way-match.js";

export type AcceptanceStatus = "draft" | "confirmed" | "cancelled";

export interface AcceptanceRow {
  id: string;
  companyId: string;
  acceptanceNo: string;
  contractId: string;
  scheduleId: string | null;
  acceptedOn: string;
  amountCents: number;
  quantityNote: string;
  status: AcceptanceStatus;
  acceptedByUserId: string;
  note: string | null;
}

export type AcceptanceFailureCode =
  | "ACCEPTANCE_NOT_FOUND"
  | "ACCEPTANCE_AMOUNT_INVALID"
  | "ACCEPTANCE_DATE_INVALID"
  | "ACCEPTANCE_INVALID_TRANSITION";

export type AcceptanceResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: AcceptanceFailureCode; message: string } };

interface AcceptanceDbRow {
  id: string;
  company_id: string;
  acceptance_no: string;
  contract_id: string;
  schedule_id: string | null;
  accepted_on: string | Date;
  amount_cents: string;
  quantity_note: string;
  status: AcceptanceStatus;
  accepted_by_user_id: string;
  note: string | null;
}

function asDate(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: AcceptanceDbRow): AcceptanceRow {
  return {
    id: row.id,
    companyId: row.company_id,
    acceptanceNo: row.acceptance_no,
    contractId: row.contract_id,
    scheduleId: row.schedule_id,
    acceptedOn: asDate(row.accepted_on),
    amountCents: Number(row.amount_cents),
    quantityNote: row.quantity_note,
    status: row.status,
    acceptedByUserId: row.accepted_by_user_id,
    note: row.note
  };
}

const COLUMNS = `
  id, company_id, acceptance_no, contract_id, schedule_id, accepted_on,
  amount_cents, quantity_note, status, accepted_by_user_id, note
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function listAcceptances(
  companyId: string,
  filter: { contractId?: string; scheduleId?: string } = {}
): Promise<AcceptanceRow[]> {
  const conditions = ["company_id = $1"];
  const params: unknown[] = [companyId];
  if (filter.contractId) {
    params.push(filter.contractId);
    conditions.push(`contract_id = $${params.length}`);
  }
  if (filter.scheduleId) {
    params.push(filter.scheduleId);
    conditions.push(`schedule_id = $${params.length}`);
  }
  const rows = await query<AcceptanceDbRow>(
    `select ${COLUMNS} from acceptances where ${conditions.join(" and ")}
      order by accepted_on desc, acceptance_no desc`,
    params
  );
  return rows.map(mapRow);
}

export interface CreateAcceptanceInput {
  companyId: string;
  contractId: string;
  scheduleId: string | null;
  acceptedOn: string;
  amountCents: number;
  quantityNote: string;
  acceptedByUserId: string;
  note: string | null;
}

export async function createAcceptance(
  input: CreateAcceptanceInput
): Promise<AcceptanceResult<AcceptanceRow>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return {
      ok: false,
      failure: { code: "ACCEPTANCE_AMOUNT_INVALID", message: "验收金额必须是非负整数分" }
    };
  }
  if (!DATE_PATTERN.test(input.acceptedOn)) {
    return {
      ok: false,
      failure: { code: "ACCEPTANCE_DATE_INVALID", message: "验收日期应形如 2026-11-20" }
    };
  }

  const yearMonth = input.acceptedOn.slice(0, 7).replace("-", "");
  const counted = await queryOne<{ count: string }>(
    `select count(*) as count from acceptances where company_id = $1 and acceptance_no like $2`,
    [input.companyId, `ACC-${yearMonth}-%`]
  );
  const acceptanceNo = `ACC-${yearMonth}-${String(Number(counted?.count ?? 0) + 1).padStart(4, "0")}`;

  const row = await queryOne<AcceptanceDbRow>(
    `insert into acceptances
       (id, company_id, acceptance_no, contract_id, schedule_id, accepted_on,
        amount_cents, quantity_note, accepted_by_user_id, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${COLUMNS}`,
    [
      `acc-${randomUUID()}`,
      input.companyId,
      acceptanceNo,
      input.contractId,
      input.scheduleId,
      input.acceptedOn,
      input.amountCents,
      input.quantityNote,
      input.acceptedByUserId,
      input.note
    ]
  );
  return { ok: true, value: mapRow(row!) };
}

const TRANSITIONS: Record<AcceptanceStatus, Partial<Record<string, AcceptanceStatus>>> = {
  draft: { confirm: "confirmed", cancel: "cancelled" },
  // 已确认的可以作废（验收后发现质量问题、退货），但不能退回草稿——
  // 那会让「确认过」这个事实消失，而下游的三单匹配已经按它算过了。
  confirmed: { cancel: "cancelled" },
  cancelled: {}
};

export async function transitionAcceptance(
  companyId: string,
  id: string,
  action: string
): Promise<AcceptanceResult<AcceptanceRow>> {
  const current = await queryOne<AcceptanceDbRow>(
    `select ${COLUMNS} from acceptances where company_id = $1 and id = $2`,
    [companyId, id]
  );
  if (!current) {
    return { ok: false, failure: { code: "ACCEPTANCE_NOT_FOUND", message: "验收单不存在" } };
  }

  const target = TRANSITIONS[current.status][action];
  if (!target) {
    return {
      ok: false,
      failure: {
        code: "ACCEPTANCE_INVALID_TRANSITION",
        message: `验收单当前是「${current.status}」，不允许执行「${action}」`
      }
    };
  }

  const updated = await queryOne<AcceptanceDbRow>(
    `update acceptances set status = $3, updated_at = now()
      where company_id = $1 and id = $2 returning ${COLUMNS}`,
    [companyId, id, target]
  );
  return { ok: true, value: mapRow(updated!) };
}

/**
 * 某期次的三单匹配结果。
 *
 * 三个数各有各的「没有记录」语义（见 `three-way-match.ts` 的 null 说明）：
 *
 * - 该合同**一张验收单都没有** → `acceptedAmountCents` 传 null，不做验收判定。
 *   合同不需要验收（服务、租赁）时就是这种情况。
 * - 该合同**一张发票都没有** → `invoicedAmountCents` 传 null。
 *
 * 有单据但金额为 0 与没有单据是不同的：前者传 0，会正常参与比较。
 */
export async function matchScheduleThreeWay(
  companyId: string,
  scheduleId: string,
  requestedPaymentCents: number
): Promise<ControlCheckResult[]> {
  const schedule = await queryOne<{ amount_cents: string; contract_id: string }>(
    `select amount_cents, contract_id from contract_payment_schedules
      where company_id = $1 and id = $2`,
    [companyId, scheduleId]
  );
  if (!schedule) return [];

  // 已验收：优先取本期次的；没有期次级验收单时退回按合同汇总——
  // 一次性验收的合同不填期次，那张单属于整个合同。
  const accepted = await queryOne<{ by_schedule: string | null; by_contract: string | null }>(
    // 两个子查询都带 company_id：不带的话跨租户能读到别家的验收金额，
    // 而三单匹配的结果会直接影响付款审批的判断。
    // （第一版漏了这个条件，$1 无处可用，Postgres 直接报「推断不出参数类型」——
    //  报错反倒把安全问题一起暴露了。）
    `select
       (select sum(amount_cents) from acceptances
         where company_id = $1 and schedule_id = $2 and status = 'confirmed') as by_schedule,
       (select sum(amount_cents) from acceptances
         where company_id = $1 and contract_id = $3 and status = 'confirmed') as by_contract`,
    [companyId, scheduleId, schedule.contract_id]
  );
  const acceptedCents =
    accepted?.by_schedule != null
      ? Number(accepted.by_schedule)
      : accepted?.by_contract != null
        ? Number(accepted.by_contract)
        : null;

  // 已开票：按合同的往来单位与合同号匹配发票。FT 的发票没有直接挂合同的
  // 外键，只能按对方名称汇总——**匹配不到就传 null 而不是 0**：
  // 0 会被当成「开了零元的票」，从而报出一条「验收超过开票」的假告警。
  const invoiced = await queryOne<{ total: string | null }>(
    `select sum(i.total_amount) as total
       from invoices i
       join contracts c on c.id = $2
      where i.company_id = $1
        and i.direction = 'in'
        and i.seller_name = c.counterparty_name`,
    [companyId, schedule.contract_id]
  );

  const paid = await queryOne<{ total: string }>(
    `select coalesce(sum(amount_cents), 0) as total from payments
      where company_id = $1 and schedule_id = $2 and status = 'paid'`,
    [companyId, scheduleId]
  );

  return matchThreeWay({
    scheduleAmountCents: Number(schedule.amount_cents),
    acceptedAmountCents: acceptedCents,
    invoicedAmountCents: invoiced?.total != null ? toCents(invoiced.total) : null,
    paidAmountCents: Number(paid?.total ?? 0),
    requestedPaymentCents
  });
}
