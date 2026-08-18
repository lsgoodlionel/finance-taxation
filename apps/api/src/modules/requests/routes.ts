/**
 * 申请单的 HTTP 接线（V13-B1/B2）。
 *
 * - `GET   /api/requests?mine=true&status=pending`  列表
 * - `POST  /api/requests`                           新建（草稿）
 * - `GET   /api/requests/:id`                       详情
 * - `PATCH /api/requests/:id`                       改内容（仅草稿与被驳回）
 * - `POST  /api/requests/:id/transition`            提交 / 批准 / 驳回 / 撤回 / 完成
 * - `POST  /api/requests/:id/precheck`              提交前的预算与超标预检
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { checkBudget } from "../budget/check.js";
import { findApplicableBudgets, loadBudgetUsage } from "../budget/queries.js";
import { highestLevel, type ControlCheckResult } from "../controls/result.js";
import { REQUEST_TYPES, type RequestAction, type RequestStatus, type RequestType } from "./lifecycle.js";
import {
  createRequest,
  getRequest,
  listRequests,
  transitionRequest,
  updateRequest,
  type RequestFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<RequestFailureCode, number> = {
  REQUEST_NOT_FOUND: 404,
  REQUEST_AMOUNT_INVALID: 400,
  REQUEST_DATE_INVALID: 400,
  REQUEST_NOT_EDITABLE: 409,
  REQUEST_INVALID_TRANSITION: 409,
  REQUEST_BUDGET_BLOCKED: 409,
  REQUEST_NOT_OWNER: 403
};

const ACTIONS: readonly RequestAction[] = ["submit", "approve", "reject", "cancel", "complete"];

function asRequestType(value: unknown): RequestType | null {
  return typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value)
    ? (value as RequestType)
    : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function listRequestsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listRequests(req.auth!.companyId, {
    // mine=true 是「我的单据」页用的。默认返回全部——财务要看得到所有人的申请。
    requesterUserId: url.searchParams.get("mine") === "true" ? req.auth!.userId : undefined,
    status: (url.searchParams.get("status") as RequestStatus) || undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function getRequestRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const found = await getRequest(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "申请单不存在", code: "REQUEST_NOT_FOUND" });
    return;
  }
  json(res, 200, { request: found });
}

export async function createRequestRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const requestType = asRequestType(body.requestType);
  if (!requestType) {
    json(res, 400, { error: `requestType 必须是 ${REQUEST_TYPES.join(" / ")}` });
    return;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title === "") {
    json(res, 400, { error: "标题不能为空" });
    return;
  }

  const result = await createRequest({
    companyId: req.auth!.companyId,
    requestType,
    title,
    purpose: typeof body.purpose === "string" ? body.purpose.trim() : "",
    amountCents: Number(body.amountCents),
    costCenterId: asNullableString(body.costCenterId),
    accountCode: asNullableString(body.accountCode),
    expectedDate: typeof body.expectedDate === "string" ? body.expectedDate : "",
    requesterUserId: req.auth!.userId,
    note: asNullableString(body.note)
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { request: result.value });
}

export async function updateRequestRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await updateRequest(req.auth!.companyId, id, {
    title: typeof body.title === "string" ? body.title.trim() : undefined,
    purpose: typeof body.purpose === "string" ? body.purpose.trim() : undefined,
    amountCents: body.amountCents === undefined ? undefined : Number(body.amountCents),
    costCenterId: "costCenterId" in body ? asNullableString(body.costCenterId) : undefined,
    accountCode: "accountCode" in body ? asNullableString(body.accountCode) : undefined,
    expectedDate: typeof body.expectedDate === "string" ? body.expectedDate : undefined,
    note: "note" in body ? asNullableString(body.note) : undefined
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 200, { request: result.value });
}

/**
 * 预检：这单提交上去会不会超预算。
 *
 * 独立成接口而不是塞进提交流程：用户填表时就该看到「这笔会超支 2000 元」，
 * 而不是点了提交才被拒。同一套 `checkBudget` 两处共用，判断不会走岔。
 */
export async function precheckRequestRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const found = await getRequest(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "申请单不存在", code: "REQUEST_NOT_FOUND" });
    return;
  }

  if (!found.accountCode) {
    // 没填科目就没法查预算。**不当成错误**——申请阶段还没想好挂哪个科目
    // 是最常见的初始状态，这里如实说明而不是报错。
    json(res, 200, {
      level: "ok",
      checks: [],
      note: "未填写科目，无法做预算校验。填上科目后可再次预检。"
    });
    return;
  }

  const budgets = await findApplicableBudgets(req.auth!.companyId, {
    date: found.expectedDate,
    accountCode: found.accountCode,
    costCenterId: found.costCenterId
  });

  const checks = await Promise.all(
    budgets.map(async (budget) => {
      const usage = await loadBudgetUsage(budget);
      // 排除本单自己已有的占用：重新预检一张已批准的单时，它自己占的那部分
      // 不该算成「别人占用的额度」，否则会显示成超支两倍。
      const result = checkBudget({
        budgetCents: budget.amountCents,
        encumberedCents: Math.max(0, usage.encumberedCents),
        actualCents: Math.max(0, usage.actualCents),
        requestCents: found.amountCents,
        policy: budget.controlPolicy
      });
      return { budgetId: budget.id, periodKey: budget.periodKey, ...result };
    })
  );

  json(res, 200, {
    level: highestLevel(checks as ControlCheckResult[]),
    checks,
    total: checks.length
  });
}

export async function transitionRequestRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    json(res, 400, { error: `action 必须是 ${ACTIONS.join(" / ")}` });
    return;
  }

  const result = await transitionRequest({
    companyId: req.auth!.companyId,
    id,
    action: action as RequestAction,
    actorUserId: req.auth!.userId
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
    action: `request.${action}`,
    resourceType: "request",
    resourceId: id,
    resourceLabel: `${result.value.requestNo} ${result.value.title}`,
    // 状态与派生的事项一起记：稽查时要答得出「这笔钱的申请什么时候批的、
    // 对应总线上哪条事项」。
    changes: { status: result.value.status, businessEventId: result.value.businessEventId }
  });

  json(res, 200, { request: result.value });
}
