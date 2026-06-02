/**
 * P3 对账引擎 HTTP 路由层
 * POST /api/banking/reconciliation/run
 * GET  /api/banking/reconciliation/candidates
 * POST /api/banking/reconciliation/candidates/:id/confirm
 * POST /api/banking/reconciliation/candidates/:id/reject
 * GET  /api/banking/reconciliation/rules
 * PUT  /api/banking/reconciliation/rules
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import {
  runReconciliation,
  listCandidates,
  confirmCandidate,
  rejectCandidate,
  getReconRules,
  upsertReconRules,
} from "./reconciliation.js";

export async function runReconciliationRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { statementIds?: string[]; importBatch?: string };
  const result = await runReconciliation(cid, {
    statementIds: body.statementIds,
    importBatch: body.importBatch,
  });
  json(res, 200, { ok: true, ...result });
}

export async function listCandidatesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const status = url.searchParams.get("status") ?? undefined;
  const items = await listCandidates(req.auth!.companyId, status);
  json(res, 200, { items, total: items.length });
}

export async function confirmCandidateRoute(
  req: ApiRequest,
  res: ServerResponse,
  candidateId: string,
): Promise<void> {
  try {
    await confirmCandidate(req.auth!.companyId, candidateId, req.auth!.userId);
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 404, { error: err instanceof Error ? err.message : "候选记录不存在" });
  }
}

export async function rejectCandidateRoute(
  req: ApiRequest,
  res: ServerResponse,
  candidateId: string,
): Promise<void> {
  await rejectCandidate(req.auth!.companyId, candidateId, req.auth!.userId);
  json(res, 200, { ok: true });
}

export async function getReconRulesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const rules = await getReconRules(req.auth!.companyId);
  json(res, 200, rules);
}

export async function upsertReconRulesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  await upsertReconRules(req.auth!.companyId, {
    amountTolerance: body.amountTolerance as number | undefined,
    dateWindowDays: body.dateWindowDays as number | undefined,
    autoConfirmThreshold: body.autoConfirmThreshold as number | undefined,
    unmatchedEventDays: body.unmatchedEventDays as number | undefined,
    keywordWeights: body.keywordWeights as Record<string, number> | undefined,
  });
  const rules = await getReconRules(req.auth!.companyId);
  json(res, 200, { ok: true, rules });
}
