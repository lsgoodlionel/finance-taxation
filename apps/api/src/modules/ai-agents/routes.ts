/**
 * P6 AI Agents HTTP 路由
 * POST /api/ai/accounting/suggest   会计处理 Agent：从事项生成分录建议（留痕）
 * GET  /api/ai/results              按业务对象查 AI 结果
 * POST /api/ai/results/:id/accept   采纳/驳回 AI 建议
 */

import type { ServerResponse } from "node:http";
import { queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { withAiRun, recordAiResult, listAiResults, setResultAccepted } from "../../services/ai-runs.js";
import { suggestAccountingEntry } from "./accounting-agent.js";

export async function suggestAccounting(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { businessEventId?: string };
  if (!body.businessEventId) { json(res, 400, { error: "businessEventId 为必填项" }); return; }

  const event = await queryOne<{ id: string; type: string; title: string; amount: string | null }>(
    "SELECT id, type, title, amount FROM business_events WHERE id=$1 AND company_id=$2",
    [body.businessEventId, cid],
  );
  if (!event) { json(res, 404, { error: "经营事项不存在" }); return; }

  const result = await withAiRun(
    { companyId: cid, agentType: "accounting", inputSummary: `${event.type} · ${event.title}`, model: "rule-based", createdBy: req.auth!.userId },
    async (runId) => {
      const suggestion = suggestAccountingEntry({
        id: event.id, type: event.type, title: event.title,
        amount: event.amount === null ? null : Number(event.amount),
      });
      const resultId = await recordAiResult({
        runId, companyId: cid, agentType: "accounting", resultType: "suggestion",
        resourceType: "business_event", resourceId: event.id,
        content: { templateKey: suggestion.templateKey, voucherType: suggestion.voucherType, lines: suggestion.lines },
        summary: suggestion.rationale, confidence: suggestion.confidence,
      });
      return { resultId, suggestion };
    },
  );

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "ai.accounting.suggested",
    resourceType: "business_event", resourceId: event.id, changes: { resultId: result.resultId } });
  json(res, 200, { ok: true, resultId: result.resultId, ...result.suggestion });
}

export async function getAiResults(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const items = await listAiResults(req.auth!.companyId, {
    resourceType: url.searchParams.get("resourceType") ?? undefined,
    resourceId: url.searchParams.get("resourceId") ?? undefined,
    agentType: url.searchParams.get("agentType") ?? undefined,
  });
  json(res, 200, { items, total: items.length });
}

export async function acceptAiResult(req: ApiRequest, res: ServerResponse, resultId: string): Promise<void> {
  const body = (req.body ?? {}) as { accepted?: boolean };
  const ok = await setResultAccepted(req.auth!.companyId, resultId, body.accepted ?? true);
  if (!ok) { json(res, 404, { error: "AI 结果不存在" }); return; }
  json(res, 200, { ok: true });
}
