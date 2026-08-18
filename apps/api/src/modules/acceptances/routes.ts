/**
 * 验收单的 HTTP 接线（V13 残留 7）。
 *
 * - `GET  /api/acceptances?contractId=`     验收单列表
 * - `POST /api/acceptances`                 新建验收单
 * - `POST /api/acceptances/:id/transition`  确认 / 作废
 * - `GET  /api/schedules/:id/three-way`     某期次的三单匹配结果
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { highestLevel } from "../controls/result.js";
import {
  createAcceptance,
  listAcceptances,
  matchScheduleThreeWay,
  transitionAcceptance,
  type AcceptanceFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<AcceptanceFailureCode, number> = {
  ACCEPTANCE_NOT_FOUND: 404,
  ACCEPTANCE_AMOUNT_INVALID: 400,
  ACCEPTANCE_DATE_INVALID: 400,
  ACCEPTANCE_INVALID_TRANSITION: 409
};

export async function listAcceptancesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listAcceptances(req.auth!.companyId, {
    contractId: url.searchParams.get("contractId") ?? undefined,
    scheduleId: url.searchParams.get("scheduleId") ?? undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function createAcceptanceRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const contractId = typeof body.contractId === "string" ? body.contractId.trim() : "";
  if (contractId === "") {
    json(res, 400, { error: "contractId 不能为空" });
    return;
  }

  const result = await createAcceptance({
    companyId: req.auth!.companyId,
    contractId,
    scheduleId: typeof body.scheduleId === "string" ? body.scheduleId : null,
    acceptedOn: typeof body.acceptedOn === "string" ? body.acceptedOn : "",
    amountCents: Number(body.amountCents),
    quantityNote: typeof body.quantityNote === "string" ? body.quantityNote.trim() : "",
    // 验收人固定取当前用户：验收的意义就在于「另一个人确认东西真的到了」，
    // 让调用方指定验收人等于把这个意义抹掉。
    acceptedByUserId: req.auth!.userId,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { acceptance: result.value });
}

export async function transitionAcceptanceRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  const result = await transitionAcceptance(req.auth!.companyId, id, action);
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
    action: `acceptance.${action}`,
    resourceType: "acceptance",
    resourceId: id,
    resourceLabel: `${result.value.acceptanceNo}（${(result.value.amountCents / 100).toFixed(2)} 元）`,
    changes: { status: result.value.status }
  });

  json(res, 200, { acceptance: result.value });
}

/**
 * 某期次的三单匹配（V13 残留 7）。
 *
 * 付款前调用，把「合同期次 × 验收 × 发票」三方的差异摆给审批人看。
 * **一条都不 block**——三种不一致都有正当解释（预付款、先票后货、
 * 货到票未到），拦死会让正常业务卡住。价值在于让人看见。
 */
export async function scheduleThreeWayRoute(
  req: ApiRequest,
  res: ServerResponse,
  scheduleId: string
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const requested = Number(url.searchParams.get("amountCents") ?? "0");
  if (!Number.isInteger(requested) || requested < 0) {
    json(res, 400, { error: "amountCents 必须是非负整数分" });
    return;
  }

  const findings = await matchScheduleThreeWay(req.auth!.companyId, scheduleId, requested);
  json(res, 200, { level: highestLevel(findings), findings, total: findings.length });
}
