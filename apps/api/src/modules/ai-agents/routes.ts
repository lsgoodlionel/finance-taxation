/**
 * P6 AI Agents HTTP 路由
 * POST /api/ai/accounting/suggest   会计处理 Agent：从事项生成分录建议（留痕）
 * GET  /api/ai/results              按业务对象查 AI 结果
 * POST /api/ai/results/:id/accept   采纳/驳回 AI 建议
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { withAiRun, recordAiResult, listAiResults, setResultAccepted } from "../../services/ai-runs.js";
import { suggestAccountingEntry } from "./accounting-agent.js";
import { assessCompleteness } from "./completeness-agent.js";
import { buildAuditReview } from "./audit-agent.js";

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

export async function assessEventCompleteness(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { businessEventId?: string };
  if (!body.businessEventId) { json(res, 400, { error: "businessEventId 为必填项" }); return; }

  const event = await queryOne<{ id: string; type: string; title: string; contract_id: string | null }>(
    "SELECT id, type, title, contract_id FROM business_events WHERE id=$1 AND company_id=$2",
    [body.businessEventId, cid],
  );
  if (!event) { json(res, 404, { error: "经营事项不存在" }); return; }

  const cnt = async (sql: string) => {
    const r = await queryOne<{ n: string }>(sql, [event.id, cid]);
    return parseInt(r?.n ?? "0", 10);
  };
  const [invoices, docs, vouchers] = await Promise.all([
    cnt("SELECT count(*)::text n FROM invoices WHERE business_event_id=$1 AND company_id=$2"),
    cnt("SELECT count(*)::text n FROM generated_documents WHERE business_event_id=$1 AND company_id=$2"),
    cnt("SELECT count(*)::text n FROM vouchers WHERE business_event_id=$1 AND company_id=$2"),
  ]);

  const result = await withAiRun(
    { companyId: cid, agentType: "completeness", inputSummary: `${event.type} · ${event.title}`, model: "rule-based", createdBy: req.auth!.userId },
    async (runId) => {
      const assessment = assessCompleteness({
        type: event.type, hasContract: !!event.contract_id,
        hasInvoice: invoices > 0, hasDocument: docs > 0, hasVoucher: vouchers > 0,
      });
      const resultId = await recordAiResult({
        runId, companyId: cid, agentType: "completeness",
        resultType: assessment.blocked ? "finding" : "suggestion",
        resourceType: "business_event", resourceId: event.id,
        content: { required: assessment.required, missing: assessment.missing, blocked: assessment.blocked },
        summary: assessment.recommendation, confidence: assessment.score,
      });
      return { resultId, assessment };
    },
  );

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "ai.completeness.assessed",
    resourceType: "business_event", resourceId: event.id, changes: { missing: result.assessment.missing.length } });
  json(res, 200, { ok: true, resultId: result.resultId, ...result.assessment });
}

export async function auditReview(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const n = async (sql: string) => {
    const r = await queryOne<{ n: string }>(sql, [cid]);
    return parseInt(r?.n ?? "0", 10);
  };
  const [openHigh, openMedium, openLow, draftVouchers, unmatched, posted] = await Promise.all([
    n("SELECT count(*)::text n FROM risk_findings WHERE company_id=$1 AND status='open' AND severity='high'"),
    n("SELECT count(*)::text n FROM risk_findings WHERE company_id=$1 AND status='open' AND severity='medium'"),
    n("SELECT count(*)::text n FROM risk_findings WHERE company_id=$1 AND status='open' AND severity='low'"),
    n("SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='draft'"),
    n("SELECT count(*)::text n FROM bank_statements WHERE company_id=$1 AND match_status='unmatched'"),
    n("SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='posted'"),
  ]);

  const result = await withAiRun(
    { companyId: cid, agentType: "audit", inputSummary: "全量审计勾稽", model: "rule-based", createdBy: req.auth!.userId },
    async (runId) => {
      const review = buildAuditReview({ openHigh, openMedium, openLow, draftVouchers, unmatchedStatements: unmatched, postedVouchers: posted });
      const resultId = await recordAiResult({
        runId, companyId: cid, agentType: "audit",
        resultType: review.riskLevel === "clean" ? "suggestion" : "finding",
        content: { riskLevel: review.riskLevel, findings: review.findings, sampleSize: review.sampleSize },
        summary: review.recommendation, confidence: review.riskLevel === "clean" ? 0.8 : 0.6,
      });
      return { resultId, review };
    },
  );

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "ai.audit.reviewed",
    resourceType: "company", changes: { riskLevel: result.review.riskLevel } });
  json(res, 200, { ok: true, resultId: result.resultId, ...result.review });
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
