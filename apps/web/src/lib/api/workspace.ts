/**
 * AI Agents / 就绪度 / 全局搜索 / 待办收件箱 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── P6 AI Agents ─────────────────────────────────────────────────────────────

export interface AccountingSuggestion {
  ok: boolean;
  resultId: string;
  templateKey: string | null;
  voucherType: string;
  lines: { id: string; summary: string; accountCode: string; accountName: string; debit: string; credit: string }[];
  rationale: string;
  confidence: number;
  needsReview: boolean;
}

export async function suggestAccounting(businessEventId: string) {
  return request<AccountingSuggestion>("/api/ai/accounting/suggest", {
    method: "POST", body: JSON.stringify({ businessEventId })
  });
}

export interface CompletenessResult {
  ok: boolean;
  resultId: string;
  required: string[];
  missing: string[];
  score: number;
  blocked: boolean;
  recommendation: string;
}

export async function assessCompleteness(businessEventId: string) {
  return request<CompletenessResult>("/api/ai/completeness/assess", {
    method: "POST", body: JSON.stringify({ businessEventId })
  });
}

export interface AuditReviewResult {
  ok: boolean;
  resultId: string;
  riskLevel: "high" | "medium" | "low" | "clean";
  findings: string[];
  sampleSize: number;
  recommendation: string;
}

export async function auditReview() {
  return request<AuditReviewResult>("/api/ai/audit/review", { method: "POST", body: JSON.stringify({}) });
}

export async function acceptAiResult(resultId: string, accepted: boolean) {
  return request<{ ok: boolean }>(`/api/ai/results/${resultId}/accept`, {
    method: "POST", body: JSON.stringify({ accepted })
  });
}

// ── 设置就绪度 ───────────────────────────────────────────────────────────────

export interface SetupItem {
  key: string;
  label: string;
  done: boolean;
  actionPath: string;
  hint: string;
}

export async function getSetupStatus() {
  return request<{ items: SetupItem[]; doneCount: number; total: number; ready: boolean }>("/api/setup/status");
}

// ── 全局搜索 ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: string;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string;
  path: string;
}

export async function globalSearch(q: string) {
  return request<{ results: SearchResult[]; total: number }>(`/api/search?q=${encodeURIComponent(q)}`);
}

// ── 统一待办收件箱 ───────────────────────────────────────────────────────────

export interface InboxItem {
  key: string;
  label: string;
  count: number;
  tone: "warning" | "info";
  actionPath: string;
  hint: string;
}

export async function getInbox() {
  return request<{ items: InboxItem[]; totalPending: number }>("/api/inbox");
}

// 月度结账状态原有两套并行来源：P0-2 的 /api/close/status 清单与 H2-w2 的
// /api/ledger/close-plan 状态机。前者已无消费者且口径更粗（银行对账只数
// 未匹配笔数），V12-C5 已把它独有的三项（工资确认、社保关账、银行对账）
// 并入状态机并删除。月结状态一律走 getClosePlan。
