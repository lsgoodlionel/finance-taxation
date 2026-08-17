/**
 * 借款单的 HTTP 接线（V13-B3/B6）。
 *
 * - `GET  /api/advances?mine=true`        列表（含未还余额）
 * - `POST /api/advances`                  新建
 * - `GET  /api/advances/:id`              详情
 * - `POST /api/advances/:id/transition`   提交 / 批准 / 作废 / 标记结清
 * - `POST /api/advances/:id/pay`          出纳付款，生成凭证草稿
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { payAdvance } from "./payment.js";
import {
  createAdvance,
  getAdvance,
  getAdvanceBalanceCents,
  listAdvances,
  transitionAdvance,
  type AdvanceFailureCode,
  type AdvanceRow,
  type AdvanceStatus
} from "./store.js";

const STATUS_BY_FAILURE: Record<AdvanceFailureCode, number> = {
  ADVANCE_NOT_FOUND: 404,
  ADVANCE_AMOUNT_INVALID: 400,
  ADVANCE_INVALID_TRANSITION: 409,
  ADVANCE_BANK_ACCOUNT_MISSING: 400,
  ADVANCE_HAS_BALANCE: 409
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 借款连同未还余额。
 *
 * 余额来自账上（1221 该往来单位的净额），不是 advances 表上的字段——
 * 两处各记一份迟早对不上，而对不上时没人知道该信哪个。
 */
async function withBalance(advance: AdvanceRow) {
  return { ...advance, outstandingCents: await getAdvanceBalanceCents(advance) };
}

export async function listAdvancesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const rows = await listAdvances(req.auth!.companyId, {
    borrowerUserId: url.searchParams.get("mine") === "true" ? req.auth!.userId : undefined,
    status: (url.searchParams.get("status") as AdvanceStatus) || undefined
  });
  const items = await Promise.all(rows.map(withBalance));
  json(res, 200, { items, total: items.length });
}

export async function getAdvanceRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const found = await getAdvance(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "借款单不存在", code: "ADVANCE_NOT_FOUND" });
    return;
  }
  json(res, 200, { advance: await withBalance(found) });
}

export async function createAdvanceRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const expectedReturnDate =
    typeof body.expectedReturnDate === "string" && DATE_PATTERN.test(body.expectedReturnDate)
      ? body.expectedReturnDate
      : null;

  const result = await createAdvance({
    companyId: req.auth!.companyId,
    requestId: typeof body.requestId === "string" ? body.requestId : null,
    // 借款人固定是自己：代别人借款在制度上就不该允许，那会让「谁欠公司钱」
    // 变成一个可以由他人指定的事实。
    borrowerUserId: req.auth!.userId,
    amountCents: Number(body.amountCents),
    purpose: typeof body.purpose === "string" ? body.purpose.trim() : "",
    expectedReturnDate,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { advance: await withBalance(result.value) });
}

export async function transitionAdvanceRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  const result = await transitionAdvance(req.auth!.companyId, id, action);
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
    action: `advance.${action}`,
    resourceType: "advance",
    resourceId: id,
    resourceLabel: `${result.value.advanceNo} ${result.value.purpose}`,
    changes: { status: result.value.status }
  });

  json(res, 200, { advance: await withBalance(result.value) });
}

/**
 * 出纳付款：生成凭证草稿并把借款标记为已付款。
 *
 * 凭证是 draft——会计要看一眼再过账。所以「已付款」在这一刻只是流程状态，
 * 账上真正出现这笔钱要等凭证过账。
 */
export async function payAdvanceRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const found = await getAdvance(req.auth!.companyId, id);
  if (!found) {
    json(res, 404, { error: "借款单不存在", code: "ADVANCE_NOT_FOUND" });
    return;
  }
  if (found.status !== "approved" && found.status !== "paid") {
    json(res, 409, {
      error: `借款单当前是「${found.status}」，只有已批准的才能付款。`,
      code: "ADVANCE_INVALID_TRANSITION"
    });
    return;
  }

  const paidOn = typeof body.paidOn === "string" && DATE_PATTERN.test(body.paidOn)
    ? body.paidOn
    : new Date().toISOString().slice(0, 10);

  const outcome = await payAdvance({
    advance: found,
    paidOn,
    bankAccountCode: typeof body.bankAccountCode === "string" ? body.bankAccountCode : undefined,
    createdByUserId: req.auth!.userId
  });

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "advance.pay",
    resourceType: "advance",
    resourceId: id,
    resourceLabel: `${found.advanceNo} 付款`,
    changes: { voucherId: outcome.voucherId, paidOn }
  });

  json(res, 200, {
    voucherId: outcome.voucherId,
    status: outcome.status,
    // 说清楚凭证是草稿：出纳点完付款不会立刻在账上看到这笔，
    // 不说明白会被当成故障。
    note: "已生成付款凭证草稿，需会计复核后过账。"
  });
}
