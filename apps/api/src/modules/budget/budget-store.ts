/**
 * 预算的写入与占用流转（V13-A2）。
 *
 * 读在 `queries.ts`，写在这里。分开是因为写路径要处理幂等与并发，
 * 而读路径只是取数——混在一起会让「查一下预算」也背上事务的复杂度。
 */

import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { periodKeyToDateRange, type BudgetPeriodType } from "./period.js";
import type { BudgetControlPolicy } from "./check.js";
import { mapBudgetRow, type BudgetRow } from "./queries.js";

export type BudgetFailureCode =
  | "BUDGET_PERIOD_INVALID"
  | "BUDGET_AMOUNT_INVALID"
  | "BUDGET_DUPLICATE"
  | "BUDGET_NOT_FOUND"
  | "BUDGET_HAS_ENCUMBRANCE";

export interface BudgetFailure {
  code: BudgetFailureCode;
  message: string;
}

/**
 * 统一用 `value` 而不是 `budget` 做载荷名——approval / requests 两个模块的
 * Result 都是 `{ ok, value }`，三处两种形状会让人在调用点习惯性写错
 *（写这批代码时真的踩了一次：`result.value` 取到 undefined）。
 */
export type BudgetResult =
  | { ok: true; value: BudgetRow }
  | { ok: false; failure: BudgetFailure };

export interface CreateBudgetInput {
  companyId: string;
  periodType: BudgetPeriodType;
  periodKey: string;
  costCenterId: string | null;
  accountCode: string | null;
  amountCents: number;
  controlPolicy: BudgetControlPolicy;
  note: string | null;
}

/** Postgres 唯一约束冲突。 */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export async function createBudget(input: CreateBudgetInput): Promise<BudgetResult> {
  // 期间键格式：库里有 CHECK 兜底，但在这里先判是为了给出**能看懂的**错误。
  // CHECK 抛出的是 "violates check constraint budgets_period_key_matches_type"，
  // 对着那句话用户不知道该填什么。
  try {
    periodKeyToDateRange(input.periodType, input.periodKey);
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: "BUDGET_PERIOD_INVALID",
        message: error instanceof Error ? error.message : "期间键格式不正确"
      }
    };
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return {
      ok: false,
      failure: { code: "BUDGET_AMOUNT_INVALID", message: "预算金额必须是非负整数分" }
    };
  }

  const id = `bdg-${randomUUID()}`;
  try {
    const row = await queryOne<Parameters<typeof mapBudgetRow>[0]>(
      `insert into budgets
         (id, company_id, period_type, period_key, cost_center_id,
          account_code, amount_cents, control_policy, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, company_id, period_type, period_key, cost_center_id,
                 account_code, amount_cents, control_policy, note`,
      [
        id,
        input.companyId,
        input.periodType,
        input.periodKey,
        input.costCenterId,
        input.accountCode,
        input.amountCents,
        input.controlPolicy,
        input.note
      ]
    );
    return { ok: true, value: mapBudgetRow(row!) };
  } catch (error) {
    // 唯一索引用 coalesce 把 null 补成 '*'，所以两条「全公司 + 不限科目」的
    // 预算也会撞——这正是要拦的：重复建会让可用额度凭空翻倍。
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        failure: {
          code: "BUDGET_DUPLICATE",
          message: "同一期间、部门、科目下已有预算。请修改已有的那条，而不是新建。"
        }
      };
    }
    throw error;
  }
}

export async function updateBudgetAmount(
  companyId: string,
  id: string,
  amountCents: number,
  controlPolicy?: BudgetControlPolicy
): Promise<BudgetResult> {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return {
      ok: false,
      failure: { code: "BUDGET_AMOUNT_INVALID", message: "预算金额必须是非负整数分" }
    };
  }

  // **调减到低于已占用是允许的**：预算被砍是真实的经营事件（比如年中收紧开支），
  // 拦住它等于要求会计先去撤单据。差额不凑平——超支就照实显示为超支。
  const row = await queryOne<Parameters<typeof mapBudgetRow>[0]>(
    `update budgets
        set amount_cents = $3,
            control_policy = coalesce($4, control_policy),
            updated_at = now()
      where company_id = $1 and id = $2
      returning id, company_id, period_type, period_key, cost_center_id,
                account_code, amount_cents, control_policy, note`,
    [companyId, id, amountCents, controlPolicy ?? null]
  );

  if (!row) {
    return { ok: false, failure: { code: "BUDGET_NOT_FOUND", message: "预算不存在" } };
  }
  return { ok: true, value: mapBudgetRow(row) };
}

/**
 * 删除预算。
 *
 * 有未释放占用时拒绝——那些占用指向的单据还在流程里，删掉预算会让它们
 * 悬空（`budget_encumbrances` 的外键是 cascade，会连带删掉占用记录，
 * 于是单据以为自己占着预算，而预算和占用都没了）。
 */
export async function deleteBudget(
  companyId: string,
  id: string
): Promise<{ ok: true } | { ok: false; failure: BudgetFailure }> {
  return withTransaction(async (tx) => {
    const active = await tx.query<{ count: string }>(
      `select count(*) as count from budget_encumbrances
        where budget_id = $1 and status = 'reserved'`,
      [id]
    );
    const reserved = Number(active.rows[0]?.count ?? 0);
    if (reserved > 0) {
      return {
        ok: false as const,
        failure: {
          code: "BUDGET_HAS_ENCUMBRANCE" as const,
          message: `该预算上还有 ${reserved} 笔未结束的占用，请先处理相关单据。`
        }
      };
    }

    const deleted = await tx.query(`delete from budgets where company_id = $1 and id = $2`, [
      companyId,
      id
    ]);
    if (deleted.rowCount === 0) {
      return {
        ok: false as const,
        failure: { code: "BUDGET_NOT_FOUND" as const, message: "预算不存在" }
      };
    }
    return { ok: true as const };
  });
}

export type EncumbranceSourceType = "request" | "advance" | "reimbursement" | "payment";

/**
 * 占用预算。
 *
 * **幂等**：同一张单据对同一条预算重复调用不会占两次。靠的是
 * `uq_budget_encumbrance_source` 唯一约束 + `on conflict do update`——
 * 而不是「先查再插」，那在并发下会双双查到不存在然后双双插入。
 *
 * 重复调用时金额以最后一次为准：单据金额在审批过程中被改小是常见操作。
 */
export async function reserveBudget(input: {
  companyId: string;
  budgetId: string;
  sourceType: EncumbranceSourceType;
  sourceId: string;
  amountCents: number;
  note?: string | null;
}): Promise<void> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    throw new Error(`占用金额必须是非负整数分，收到 ${input.amountCents}`);
  }

  await query(
    `insert into budget_encumbrances
       (id, company_id, budget_id, source_type, source_id, amount_cents, status, note)
     values ($1, $2, $3, $4, $5, $6, 'reserved', $7)
     on conflict (budget_id, source_type, source_id) do update
       set amount_cents = excluded.amount_cents,
           -- 已释放的占用被重新提交时要复活（驳回后修改再提交是正常流程）
           status = 'reserved',
           note = excluded.note,
           updated_at = now()`,
    [
      `enc-${randomUUID()}`,
      input.companyId,
      input.budgetId,
      input.sourceType,
      input.sourceId,
      input.amountCents,
      input.note ?? null
    ]
  );
}

/**
 * 占用状态流转。
 *
 * - `realized`：单据已落账，占用转实际。转完之后这笔**不再计入已占用**——
 *   账上已经有实际发生额，两边都算会让预算凭空少一半。
 * - `released`：单据作废或驳回，占用释放。
 *
 * 只允许从 `reserved` 出发：已经 realized 的再 release 会让预算凭空多出额度，
 * 而那笔钱其实已经花掉了。命中 0 行时静默返回而不是抛错——重复调用（重试、
 * 用户连点）是正常的，把它当错误会让接口在正确的重试下报失败。
 */
export async function transitionEncumbrance(
  budgetId: string,
  sourceType: EncumbranceSourceType,
  sourceId: string,
  status: "realized" | "released"
): Promise<void> {
  await query(
    `update budget_encumbrances
        set status = $4, updated_at = now()
      where budget_id = $1 and source_type = $2 and source_id = $3
        and status = 'reserved'`,
    [budgetId, sourceType, sourceId, status]
  );
}
