/**
 * 费用标准的 HTTP 接线（V13-A1）。
 *
 * - `GET   /api/expense-standards?type=travel_hotel`  标准列表
 * - `POST  /api/expense-standards`                    新增
 * - `PATCH /api/expense-standards/:id`                设置止日（停用）
 * - `POST  /api/expense-standards/check`              判定一笔支出是否超标
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { checkExpenseStandard } from "./check.js";
import { matchExpenseStandard, type ExpenseLimitBasis, type ExpenseOverPolicy } from "./match.js";
import {
  createExpenseStandard,
  expireExpenseStandard,
  listExpenseStandards,
  type StandardFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<StandardFailureCode, number> = {
  STANDARD_AMOUNT_INVALID: 400,
  STANDARD_DATE_INVALID: 400,
  STANDARD_OVERLAP: 409,
  STANDARD_NOT_FOUND: 404
};

const LIMIT_BASES: readonly ExpenseLimitBasis[] = ["per_day", "per_time", "per_month"];
const OVER_POLICIES: readonly ExpenseOverPolicy[] = ["block", "warn", "escalate"];

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function listExpenseStandardsRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listExpenseStandards(
    req.auth!.companyId,
    url.searchParams.get("type") ?? undefined
  );
  json(res, 200, { items, total: items.length });
}

export async function createExpenseStandardRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const limitBasis = LIMIT_BASES.includes(body.limitBasis as ExpenseLimitBasis)
    ? (body.limitBasis as ExpenseLimitBasis)
    : null;
  if (!limitBasis) {
    json(res, 400, { error: "limitBasis 必须是 per_day / per_time / per_month" });
    return;
  }

  const result = await createExpenseStandard({
    companyId: req.auth!.companyId,
    expenseType: typeof body.expenseType === "string" ? body.expenseType : "",
    gradeCode: asNullableString(body.gradeCode),
    cityTier: asNullableString(body.cityTier),
    limitCents: Number(body.limitCents),
    limitBasis,
    overPolicy: OVER_POLICIES.includes(body.overPolicy as ExpenseOverPolicy)
      ? (body.overPolicy as ExpenseOverPolicy)
      : "warn",
    effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom : "",
    effectiveTo: asNullableString(body.effectiveTo),
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
    action: "expense_standard.create",
    resourceType: "expense_standard",
    resourceId: result.standard.id,
    resourceLabel: `${result.standard.expenseType} ${result.standard.gradeCode ?? "不限职级"}`,
    changes: { limitCents: result.standard.limitCents, overPolicy: result.standard.overPolicy }
  });

  json(res, 201, { standard: result.standard });
}

export async function expireExpenseStandardRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const effectiveTo = typeof body.effectiveTo === "string" ? body.effectiveTo : "";

  const result = await expireExpenseStandard(req.auth!.companyId, id, effectiveTo);
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
    action: "expense_standard.expire",
    resourceType: "expense_standard",
    resourceId: id,
    resourceLabel: `${result.standard.expenseType} 止于 ${effectiveTo}`,
    changes: { effectiveTo }
  });

  json(res, 200, { standard: result.standard });
}

/**
 * 判定一笔支出是否超标。
 *
 * 与预算校验不同，这里**只按一条标准判**——同一笔住宿不可能有两个限额。
 * 挑哪一条由 `match.ts` 的最具体优先规则决定。
 */
export async function checkExpenseStandardRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const expenseType = typeof body.expenseType === "string" ? body.expenseType : "";
  const onDate = typeof body.onDate === "string" ? body.onDate : "";
  const actualCents = Number(body.actualCents);
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);

  if (expenseType === "") {
    json(res, 400, { error: "expenseType 不能为空" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
    json(res, 400, { error: "onDate 应形如 2026-06-15" });
    return;
  }
  if (!Number.isInteger(actualCents) || actualCents < 0) {
    json(res, 400, { error: "actualCents 必须是非负整数分" });
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    json(res, 400, { error: "quantity 必须是正整数" });
    return;
  }

  const standards = await listExpenseStandards(req.auth!.companyId, expenseType);
  const standard = matchExpenseStandard(standards, {
    expenseType,
    gradeCode: asNullableString(body.gradeCode),
    cityTier: asNullableString(body.cityTier),
    onDate
  });

  const result = checkExpenseStandard({ standard, actualCents, quantity });
  json(res, 200, { ...result, standardId: standard?.id ?? null });
}
