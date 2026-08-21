/**
 * 数据智能 / 票税一致性 / 审计链 / AI 决策门 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── V6 Stage F 接线：数据智能 / 票税一致性 / 审计链 / AI 决策门 / 数电票 / 开放能力 ──

export type ConsistencySeverity = "ok" | "warning" | "alert";

export interface TaxConsistencyCheck {
  key: "output_tax" | "input_tax" | "invoice_vs_ledger_revenue";
  label: string;
  invoiceValueCents: number;
  comparedValueCents: number;
  differenceCents: number;
  severity: ConsistencySeverity;
}

export interface TaxConsistencyReport {
  period: string;
  checks: TaxConsistencyCheck[];
  overall: ConsistencySeverity;
  declaredDataAvailable: boolean;
  notes: string[];
}

/** F1 票税一致性：某属期发票 vs 申报 vs 账面收入分级比对。 */
export async function getTaxConsistency(period: string) {
  return request<TaxConsistencyReport>(
    `/api/tax-integration/consistency?period=${encodeURIComponent(period)}`
  );
}

export interface AuditChainVerification {
  valid: boolean;
  brokenAt?: number;
  total: number;
}

/** F2 审计 hash 链校验：整链是否被篡改。 */
export async function verifyAuditChain() {
  return request<AuditChainVerification>("/api/audit/verify-chain");
}

export interface BudgetVarianceResult {
  period: string;
  category: string[];
  actualCents: number;
  budgetCents: number;
  actual: number;
  budget: number;
  variance: number;
  utilization: number | null;
  status: "over" | "under" | "on_track";
}

/** F7 预算差异：实际发生额 vs 预算的执行率/超支。 */
export async function getBudgetVariance(params: { period: string; budget: number; category?: string }) {
  const qs = new URLSearchParams({ period: params.period, budget: String(params.budget) });
  if (params.category) qs.set("category", params.category);
  return request<BudgetVarianceResult>(`/api/analytics/budget-variance?${qs.toString()}`);
}

export interface AutomationDecision {
  level: "auto" | "suggest" | "manual";
  reason: string;
}

export interface AutomationThresholds {
  autoMin: number;
  suggestMin: number;
  financialCapCents: number;
}

/** F4 AI 分级自动化决策门：裁定某产出应自动/建议/人工。硬校验不交 LLM。 */
export async function decideAutomation(input: {
  ruleConfidence: number;
  isFinancialMutation: boolean;
  amountCents?: number;
}) {
  return request<AutomationDecision>("/api/ai/automation/decide", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getAutomationThresholds() {
  return request<AutomationThresholds>("/api/ai/automation/thresholds");
}

export interface EInvoicePayload {
  invoiceNumber: string;
  issueDate: string;
  sellerTaxNo: string;
  buyerTaxNo: string;
  amount: number;
  tax: number;
  total: number;
  direction?: "input" | "output";
}

/** F3 数电票结构化解析入库。失败返回 ok:false + errors。 */
export async function parseEInvoice(payload: EInvoicePayload) {
  return request<{ ok: boolean; invoiceId?: string; invoice?: unknown; errors?: string[] }>(
    "/api/invoices/parse",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
}

/** F6 开放能力：API Key 与 Webhook。 */
export async function listApiKeys() {
  return request<{ items: ApiKeyRecord[] }>("/api/settings/api-keys");
}

export async function createApiKey(name: string) {
  return request<{ id: string; key: string; keyPrefix: string }>("/api/settings/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(id: string) {
  return request<{ ok: boolean }>(`/api/settings/api-keys/${id}/revoke`, { method: "POST" });
}

export async function registerWebhook(input: { event_type: string; target_url: string }) {
  return request<{ ok: boolean; id: string; eventType: string; targetUrl: string; secret: string }>(
    "/api/settings/webhooks",
    { method: "POST", body: JSON.stringify(input) }
  );
}

// ── Stage H wave2：AI 月结 draft-then-approve / 月结编排 / 异常扫描 ──

export interface CloseDraftLine {
  summary: string;
  accountCode: string;
  accountName: string;
  // 后端以「元」字符串序列化金额（如 "1000.00"）；前端展示时转数字。
  debit: number | string;
  credit: number | string;
}

export interface CloseDraft {
  id: string;
  businessEventId: string;
  voucherType: string;
  summary: string;
  proposalLevel: "auto" | "suggest" | "manual" | null;
  balanced: boolean | null;
  status: string;
  rationale?: string | null;
  lines: CloseDraftLine[];
}

/**
 * 列出待人工批准的草稿凭证，供 inbox / home 逐项批准。
 *
 * 同一张 event_voucher_drafts 表有两个生产者：事项规则引擎写 status='review_required'，
 * 月结（Stage H）写 status='draft'，二者都是「待人工批准」语义。默认用 status=pending
 * 查这两种状态的并集，避免只查一种导致草稿队列恒为空；仍可传入精确状态查询。
 */
export async function getCloseDrafts(status = "pending") {
  return request<{ items: CloseDraft[]; total: number }>(
    `/api/close/drafts?status=${encodeURIComponent(status)}`
  );
}

/** 为某属期未入账事项批量生成草稿凭证提案。 */
export async function generateCloseDrafts(period: string) {
  return request<{ generated: number; skipped: number; drafts: CloseDraft[] }>(
    "/api/close/drafts/generate",
    { method: "POST", body: JSON.stringify({ period }) }
  );
}

/** 批准草稿 → 生成 draft 状态凭证（仍需经既有过账流入账），返回凭证 id。 */
export async function approveCloseDraft(id: string) {
  return request<{ ok: boolean; voucherId: string }>(`/api/close/drafts/${id}/approve`, {
    method: "POST"
  });
}

export async function rejectCloseDraft(id: string, reason?: string) {
  return request<{ ok: boolean }>(`/api/close/drafts/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export type CloseWizardStepStatus = "blocked" | "ready" | "in_review" | "done";

export interface CloseWizardStep {
  key: string;
  label: string;
  status: CloseWizardStepStatus;
  blockingReason?: string;
}

export interface CloseWizardPlan {
  steps: CloseWizardStep[];
  nextActionableStep: string | null;
  overall: "not_started" | "in_progress" | "blocked" | "completed";
}

/** 月结编排：某属期各步骤状态机（只读）。这是月结状态的唯一来源。 */
export async function getClosePlan(period: string) {
  return request<{ period: string; plan: CloseWizardPlan }>(
    `/api/ledger/close-plan?period=${encodeURIComponent(period)}`
  );
}

export interface CloseIncomeResult {
  alreadyClosed: boolean;
  periodLabel: string;
  voucherId?: string | null;
  profitCents?: number;
  [key: string]: unknown;
}

/**
 * 结转损益：把 6xxx 收入费用类科目结平到本年利润。
 *
 * **幂等**：已结转过的属期再调返回 200 与 `alreadyClosed: true`，不会重复生成分录。
 * 生成的凭证是草稿，要复核过账。
 *
 * 后端 `POST /api/ledger/periods/:id/close-income` 从 V12 起就在，
 * 而月结向导「结转损益」那一步一直把人引到总账中心——那里却没有执行入口。
 */
export async function closeIncomeForPeriod(period: string) {
  return request<CloseIncomeResult>(
    `/api/ledger/periods/${encodeURIComponent(period)}/close-income`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export interface AnomalyFinding {
  kind: string;
  severity: "info" | "warning" | "alert";
  title: string;
  detail: string;
  refs: string[];
}

/** 规则型异常扫描（重复付款/断号发票/周末大额/税负突变）。 */
export async function getAnomalyScan(period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ findings: AnomalyFinding[]; total: number; bySeverity: Record<string, number> }>(
    `/api/anomaly/scan${qs}`
  );
}
