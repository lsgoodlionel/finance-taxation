/**
 * 预算的 HTTP 接线（V13-A2/A3）。
 *
 * - `GET    /api/budgets?period=2026-06`  预算列表，含已占用与已发生
 * - `POST   /api/budgets`                 新建预算
 * - `PATCH  /api/budgets/:id`             改金额 / 改控制策略
 * - `DELETE /api/budgets/:id`             删除（有未结占用时拒绝）
 * - `POST   /api/budgets/check`           预检一笔支出，返回全部适用预算的判定
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { checkBudget, type BudgetControlPolicy, type BudgetCheckResult } from "./check.js";
import { highestLevel } from "../controls/result.js";
import {
  createBudget,
  deleteBudget,
  updateBudgetAmount,
  type BudgetFailureCode
} from "./budget-store.js";
import {
  findApplicableBudgets,
  getBudget,
  listBudgets,
  loadBudgetUsage,
  type BudgetRow
} from "./queries.js";
import type { BudgetPeriodType } from "./period.js";

/** 失败码 → HTTP 状态。冲突与找不到要分开，前端据此决定是提示还是刷新。 */
const STATUS_BY_FAILURE: Record<BudgetFailureCode, number> = {
  BUDGET_PERIOD_INVALID: 400,
  BUDGET_AMOUNT_INVALID: 400,
  BUDGET_DUPLICATE: 409,
  BUDGET_NOT_FOUND: 404,
  BUDGET_HAS_ENCUMBRANCE: 409
};

const PERIOD_TYPES: readonly BudgetPeriodType[] = ["month", "quarter", "year"];
const CONTROL_POLICIES: readonly BudgetControlPolicy[] = ["block", "warn"];

function asPeriodType(value: unknown): BudgetPeriodType | null {
  return typeof value === "string" && (PERIOD_TYPES as readonly string[]).includes(value)
    ? (value as BudgetPeriodType)
    : null;
}

function asControlPolicy(value: unknown): BudgetControlPolicy | null {
  return typeof value === "string" && (CONTROL_POLICIES as readonly string[]).includes(value)
    ? (value as BudgetControlPolicy)
    : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** 一条预算连同它的三个数。 */
interface BudgetWithUsage extends BudgetRow {
  encumberedCents: number;
  actualCents: number;
  availableCents: number;
}

async function withUsage(budget: BudgetRow): Promise<BudgetWithUsage> {
  const usage = await loadBudgetUsage(budget);
  return {
    ...budget,
    ...usage,
    // 可用额度允许为负并照实返回——差额不凑平。
    availableCents: budget.amountCents - usage.encumberedCents - usage.actualCents
  };
}

export async function listBudgetsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? undefined;
  const budgets = await listBudgets(req.auth!.companyId, period);

  // 逐条取用量。预算的条数是「期间 × 部门 × 科目」，中小企业量级在几十条，
  // 没有做成一次聚合查询——那需要把科目前缀 like 与成本中心过滤拼进一条
  // 带 lateral join 的 SQL，可读性代价远大于这里的往返开销。
  const items = await Promise.all(budgets.map(withUsage));
  json(res, 200, { items, total: items.length });
}

export async function createBudgetRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const periodType = asPeriodType(body.periodType);
  if (!periodType) {
    json(res, 400, { error: "periodType 必须是 month / quarter / year", code: "BUDGET_PERIOD_INVALID" });
    return;
  }

  const result = await createBudget({
    companyId: req.auth!.companyId,
    periodType,
    periodKey: typeof body.periodKey === "string" ? body.periodKey.trim() : "",
    costCenterId: asNullableString(body.costCenterId),
    accountCode: asNullableString(body.accountCode),
    amountCents: Number(body.amountCents),
    controlPolicy: asControlPolicy(body.controlPolicy) ?? "warn",
    note: asNullableString(body.note)
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "budget.create",
    resourceType: "budget",
    resourceId: result.value.id,
    resourceLabel: `${result.value.periodKey} ${result.value.accountCode ?? "全科目"}`,
    changes: {
      amountCents: result.value.amountCents,
      costCenterId: result.value.costCenterId,
      controlPolicy: result.value.controlPolicy
    }
  });

  json(res, 201, { budget: await withUsage(result.value) });
}

export async function updateBudgetRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const before = await getBudget(req.auth!.companyId, id);
  if (!before) {
    json(res, 404, { error: "预算不存在", code: "BUDGET_NOT_FOUND" });
    return;
  }

  const result = await updateBudgetAmount(
    req.auth!.companyId,
    id,
    Number(body.amountCents ?? before.amountCents),
    asControlPolicy(body.controlPolicy) ?? undefined
  );

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "budget.update",
    resourceType: "budget",
    resourceId: result.value.id,
    resourceLabel: `${result.value.periodKey} ${result.value.accountCode ?? "全科目"}`,
    // 金额改动要留下前后值：预算被调减是敏感操作，稽查时要答得出「谁在什么时候
    // 把这个部门的预算从 X 改成了 Y」。
    changes: { amountCentsBefore: before.amountCents, amountCentsAfter: result.value.amountCents }
  });

  json(res, 200, { budget: await withUsage(result.value) });
}

export async function deleteBudgetRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const before = await getBudget(req.auth!.companyId, id);
  const result = await deleteBudget(req.auth!.companyId, id);

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "budget.delete",
    resourceType: "budget",
    resourceId: id,
    resourceLabel: before ? `${before.periodKey} ${before.accountCode ?? "全科目"}` : id,
    changes: { amountCents: before?.amountCents ?? null }
  });

  json(res, 200, { ok: true });
}

/**
 * 预检一笔支出。
 *
 * 返回**全部**适用预算各自的判定，而不是一个总结论——预算与费用标准不同，
 * 每一条都不能超（理由见 applicable.ts）。前端要显示「部门预算够、公司总预算
 * 不够」这样的构成，只给一个 level 就丢掉了这个信息。
 *
 * `level` 字段是把它们收敛后的最严厉级别，供调用方一眼判断能不能提交。
 */
export async function checkBudgetRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const date = typeof body.date === "string" ? body.date : "";
  const accountCode = typeof body.accountCode === "string" ? body.accountCode : "";
  const amountCents = Number(body.amountCents);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    json(res, 400, { error: "date 应形如 2026-06-15" });
    return;
  }
  if (accountCode === "") {
    json(res, 400, { error: "accountCode 不能为空" });
    return;
  }
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    json(res, 400, { error: "amountCents 必须是非负整数分" });
    return;
  }

  const budgets = await findApplicableBudgets(req.auth!.companyId, {
    date,
    accountCode,
    costCenterId: asNullableString(body.costCenterId)
  });

  const checks = await Promise.all(
    budgets.map(async (budget) => {
      const usage = await loadBudgetUsage(budget);
      const result: BudgetCheckResult = checkBudget({
        budgetCents: budget.amountCents,
        // 账上出现红冲等情形时汇总可能为负，而校验拒绝负数入参。
        // 归零而不是把负数喂进去：负的「已发生」在业务上等同于「还没花」。
        encumberedCents: Math.max(0, usage.encumberedCents),
        actualCents: Math.max(0, usage.actualCents),
        requestCents: amountCents,
        policy: budget.controlPolicy
      });
      return {
        budgetId: budget.id,
        periodKey: budget.periodKey,
        costCenterId: budget.costCenterId,
        accountCode: budget.accountCode,
        ...result
      };
    })
  );

  json(res, 200, {
    // 没有任何预算适用时是 ok：没立预算是合法状态，不能因此拦住业务。
    level: highestLevel(checks),
    checks,
    total: checks.length
  });
}
