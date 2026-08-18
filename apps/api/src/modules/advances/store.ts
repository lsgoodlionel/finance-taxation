/**
 * 借款单与备用金（V13-B3/B6）。
 *
 * ## 「还剩多少没还」不存在这张表里
 *
 * 借款余额由 `1221 其他应收款` 上的**未核销余额**算出来（复用 V12-C2 的往来
 * 核销机制）。本表只记流程状态。
 *
 * 两处各记一份余额，迟早对不上——而对不上时没人知道该信哪个。会计上唯一
 * 权威的数是账上的数，所以就让它是账上的数。
 *
 * ## 付款凭证一律 draft
 *
 * 与折旧、红冲、定期凭证、增值税结转、期末调汇一致：系统生成的凭证都要
 * 会计看一眼再过账。借款付款没有理由破例。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { toCents } from "../../utils/money.js";

/** 备用金挂账科目。`account_type` 是 `asset_receivable`，本就在核销覆盖范围内。 */
export const ADVANCE_ACCOUNT_CODE = "1221";

export type AdvanceStatus = "draft" | "pending" | "approved" | "paid" | "settled" | "cancelled";

export interface AdvanceRow {
  id: string;
  companyId: string;
  advanceNo: string;
  requestId: string | null;
  borrowerUserId: string;
  counterpartyId: string;
  amountCents: number;
  purpose: string;
  expectedReturnDate: string | null;
  status: AdvanceStatus;
  paymentVoucherId: string | null;
  note: string | null;
}

export type AdvanceFailureCode =
  | "ADVANCE_NOT_FOUND"
  | "ADVANCE_AMOUNT_INVALID"
  | "ADVANCE_INVALID_TRANSITION"
  | "ADVANCE_BANK_ACCOUNT_MISSING"
  | "ADVANCE_HAS_BALANCE";

export type AdvanceResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: { code: AdvanceFailureCode; message: string } };

interface AdvanceDbRow {
  id: string;
  company_id: string;
  advance_no: string;
  request_id: string | null;
  borrower_user_id: string;
  counterparty_id: string;
  amount_cents: string;
  purpose: string;
  expected_return_date: string | Date | null;
  status: AdvanceStatus;
  payment_voucher_id: string | null;
  note: string | null;
}

function asDateString(value: string | Date | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapRow(row: AdvanceDbRow): AdvanceRow {
  return {
    id: row.id,
    companyId: row.company_id,
    advanceNo: row.advance_no,
    requestId: row.request_id,
    borrowerUserId: row.borrower_user_id,
    counterpartyId: row.counterparty_id,
    amountCents: Number(row.amount_cents),
    purpose: row.purpose,
    expectedReturnDate: asDateString(row.expected_return_date),
    status: row.status,
    paymentVoucherId: row.payment_voucher_id,
    note: row.note
  };
}

const COLUMNS = `
  id, company_id, advance_no, request_id, borrower_user_id, counterparty_id,
  amount_cents, purpose, expected_return_date, status, payment_voucher_id, note
`;

/**
 * 取（或建）员工对应的往来单位。
 *
 * `counterparties` 没有类型约束，用 `category = 'employee'` 与供应商/客户区分。
 * 自动创建而不是要求先手工建档：借款时现去建一个往来单位是纯粹的仪式，
 * 而员工信息系统里本来就有。
 *
 * 幂等靠 `(company_id, name)` 唯一约束——同名员工会共用一条记录，这在
 * 会计上是可接受的近似（真同名的两个人借款要靠摘要区分），比每次借款
 * 新建一条往来单位好得多。
 */
export async function ensureEmployeeCounterparty(
  companyId: string,
  userId: string
): Promise<string> {
  const user = await queryOne<{ display_name: string }>(
    `select display_name from users where id = $1 and company_id = $2`,
    [userId, companyId]
  );
  const name = `员工-${user?.display_name ?? userId}`;

  const existing = await queryOne<{ id: string }>(
    `select id from counterparties where company_id = $1 and name = $2`,
    [companyId, name]
  );
  if (existing) return existing.id;

  const id = `cp-emp-${randomUUID()}`;
  await query(
    `insert into counterparties (id, company_id, name, category)
     values ($1, $2, $3, 'employee')
     on conflict (company_id, name) do nothing`,
    [id, companyId, name]
  );

  // on conflict do nothing 时上面那条什么都没插，要再查一次拿到真正的 id。
  // 并发下两个请求同时建同名往来单位，一个成功一个 no-op，后者必须拿到
  // 前者的 id 而不是自己那个从未落库的。
  const settled = await queryOne<{ id: string }>(
    `select id from counterparties where company_id = $1 and name = $2`,
    [companyId, name]
  );
  return settled!.id;
}

export async function getAdvance(companyId: string, id: string): Promise<AdvanceRow | null> {
  const row = await queryOne<AdvanceDbRow>(
    `select ${COLUMNS} from advances where company_id = $1 and id = $2`,
    [companyId, id]
  );
  return row ? mapRow(row) : null;
}

export async function listAdvances(
  companyId: string,
  filter: { borrowerUserId?: string; status?: AdvanceStatus } = {}
): Promise<AdvanceRow[]> {
  const conditions = ["company_id = $1"];
  const params: unknown[] = [companyId];
  if (filter.borrowerUserId) {
    params.push(filter.borrowerUserId);
    conditions.push(`borrower_user_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  const rows = await query<AdvanceDbRow>(
    `select ${COLUMNS} from advances where ${conditions.join(" and ")} order by created_at desc`,
    params
  );
  return rows.map(mapRow);
}

export interface CreateAdvanceInput {
  companyId: string;
  requestId: string | null;
  borrowerUserId: string;
  amountCents: number;
  purpose: string;
  expectedReturnDate: string | null;
  note: string | null;
}

export async function createAdvance(
  input: CreateAdvanceInput
): Promise<AdvanceResult<AdvanceRow>> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return {
      ok: false,
      failure: { code: "ADVANCE_AMOUNT_INVALID", message: "借款金额必须是正整数分" }
    };
  }

  const counterpartyId = await ensureEmployeeCounterparty(input.companyId, input.borrowerUserId);
  const id = `adv-${randomUUID()}`;

  const row = await withTransaction(async (tx) => {
    // 单据号与申请单同一套规则：按月计数，人念得出来。
    const yearMonth = (input.expectedReturnDate ?? new Date().toISOString().slice(0, 10))
      .slice(0, 7)
      .replace("-", "");
    const counted = await tx.query<{ count: string }>(
      `select count(*) as count from advances where company_id = $1 and advance_no like $2`,
      [input.companyId, `ADV-${yearMonth}-%`]
    );
    const advanceNo = `ADV-${yearMonth}-${String(Number(counted.rows[0]?.count ?? 0) + 1).padStart(4, "0")}`;

    const inserted = await tx.query<AdvanceDbRow>(
      `insert into advances
         (id, company_id, advance_no, request_id, borrower_user_id, counterparty_id,
          amount_cents, purpose, expected_return_date, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${COLUMNS}`,
      [
        id,
        input.companyId,
        advanceNo,
        input.requestId,
        input.borrowerUserId,
        counterpartyId,
        input.amountCents,
        input.purpose,
        input.expectedReturnDate,
        input.note
      ]
    );
    return inserted.rows[0]!;
  });

  return { ok: true, value: mapRow(row) };
}

/** 借款状态机。比申请单简单：没有「驳回后再提」——借款被拒就是被拒了。 */
const TRANSITIONS: Record<AdvanceStatus, Partial<Record<string, AdvanceStatus>>> = {
  draft: { submit: "pending", cancel: "cancelled" },
  pending: { approve: "approved", reject: "cancelled", cancel: "cancelled" },
  // paid 由 payAdvance 单独处理（要生成凭证），不走通用转移。
  approved: { cancel: "cancelled" },
  paid: { settle: "settled" },
  settled: {},
  cancelled: {}
};

export async function transitionAdvance(
  companyId: string,
  id: string,
  action: string
): Promise<AdvanceResult<AdvanceRow>> {
  return withTransaction(async (tx) => {
    const found = await tx.query<AdvanceDbRow>(
      `select ${COLUMNS} from advances where company_id = $1 and id = $2 for update`,
      [companyId, id]
    );
    const row = found.rows[0];
    if (!row) {
      return {
        ok: false as const,
        failure: { code: "ADVANCE_NOT_FOUND" as const, message: "借款单不存在" }
      };
    }
    const current = mapRow(row);
    const target = TRANSITIONS[current.status][action];
    if (!target) {
      return {
        ok: false as const,
        failure: {
          code: "ADVANCE_INVALID_TRANSITION" as const,
          message: `借款单当前是「${current.status}」，不允许执行「${action}」`
        }
      };
    }

    // 结清前必须真的还清。**判据是账上的核销余额，不是本表的状态**——
    // 状态可以被人改，账不能。
    if (target === "settled") {
      const balance = await loadAdvanceBalanceCents(tx, current);
      if (balance !== 0) {
        return {
          ok: false as const,
          failure: {
            code: "ADVANCE_HAS_BALANCE" as const,
            message: `该借款在 ${ADVANCE_ACCOUNT_CODE} 上仍有 ${(balance / 100).toFixed(2)} 元未核销，不能标记结清。`
          }
        };
      }
    }

    const updated = await tx.query<AdvanceDbRow>(
      `update advances set status = $3, updated_at = now()
        where company_id = $1 and id = $2 returning ${COLUMNS}`,
      [companyId, id, target]
    );
    return { ok: true as const, value: mapRow(updated.rows[0]!) };
  });
}

/**
 * 这笔借款还剩多少没还（分）。
 *
 * 取 `1221` 上该往来单位的借贷净额——**不看 advances 表**。借出去记借方、
 * 报销冲销与退款记贷方，净额就是未还金额。
 *
 * 注意这是**按往来单位**算而不是按单据算：同一个人的多笔借款会汇总在一起。
 * 这与账龄表的口径一致（1221 上就是按往来单位分户的），也是会计上看这类
 * 挂账的常规方式——「张三还欠公司多少」比「张三的第 3 笔借款还欠多少」
 * 更接近实际关心的问题。
 */
async function loadAdvanceBalanceCents(
  tx: { query: <T extends object>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  advance: AdvanceRow
): Promise<number> {
  const rows = await tx.query<{ balance: string }>(
    `select coalesce(sum(debit - credit), 0) as balance
       from ledger_entries
      where company_id = $1 and account_code like $2 and counterparty_id = $3`,
    [advance.companyId, `${ADVANCE_ACCOUNT_CODE}%`, advance.counterpartyId]
  );
  return toCents(rows.rows[0]?.balance ?? "0");
}

export async function getAdvanceBalanceCents(advance: AdvanceRow): Promise<number> {
  const rows = await query<{ balance: string }>(
    `select coalesce(sum(debit - credit), 0) as balance
       from ledger_entries
      where company_id = $1 and account_code like $2 and counterparty_id = $3`,
    [advance.companyId, `${ADVANCE_ACCOUNT_CODE}%`, advance.counterpartyId]
  );
  return toCents(rows[0]?.balance ?? "0");
}
