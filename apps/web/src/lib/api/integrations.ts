/**
 * 集成配置与银行对账 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ─── P2: Integration Configuration ───────────────────────────────────────────

export interface IntegrationProviderMeta {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresApiSecret: boolean;
  requiresAppId: boolean;
  requiresEndpoint: boolean;
  docsUrl: string;
  freeQuota: string;
}

export interface IntegrationConfig {
  configType: string;
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig: Record<string, string>;
  enabled: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestMsg: string | null;
  updatedAt: string;
}

export async function listIntegrationConfigs() {
  return request<{
    items: IntegrationConfig[];
    providers: Record<string, IntegrationProviderMeta[]>;
  }>("/api/settings/integrations");
}

export async function getIntegrationConfig(configType: string) {
  return request<{
    config: IntegrationConfig;
    providers: IntegrationProviderMeta[];
  }>(`/api/settings/integrations/${configType}`);
}

export async function upsertIntegrationConfig(
  configType: string,
  data: {
    provider: string;
    apiKey?: string;
    apiSecret?: string;
    appId?: string;
    endpointUrl?: string;
    extraConfig?: Record<string, string>;
    enabled?: boolean;
  },
) {
  return request<{ ok: boolean; config: IntegrationConfig | null }>(
    `/api/settings/integrations/${configType}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
  );
}

export async function testIntegrationConfig(configType: string) {
  return request<{ ok: boolean; message: string; provider: string }>(
    `/api/settings/integrations/${configType}/test`,
    { method: "POST" },
  );
}

// ── 银行对账（P3 对账引擎前端对接） ──────────────────────────────
export interface ReconciliationCandidate {
  id: string;
  statement_id: string;
  voucher_id: string | null;
  score: number;
  match_reasons: string[] | string;
  amount_diff: string;
  date_diff_days: number;
  status: "pending" | "confirmed" | "rejected" | "superseded";
  created_at: string;
  stmt_date: string;
  stmt_amount: string;
  stmt_desc: string | null;
  voucher_summary: string | null;
}

export interface ReconciliationRules {
  amountTolerance: number;
  dateWindowDays: number;
  autoConfirmThreshold: number;
  unmatchedEventDays: number;
  keywordWeights: Record<string, number>;
}

export async function runBankReconciliation(data?: {
  statementIds?: string[];
  importBatch?: string;
}) {
  return request<{ ok: boolean; matched: number; suggested: number; unmatched: number }>(
    "/api/banking/reconciliation/run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function listReconciliationCandidates(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ items: ReconciliationCandidate[]; total: number }>(
    `/api/banking/reconciliation/candidates${qs}`,
  );
}

export async function confirmReconciliationCandidate(id: string) {
  return request<{ ok: boolean }>(`/api/banking/reconciliation/candidates/${id}/confirm`, {
    method: "POST",
  });
}

export async function rejectReconciliationCandidate(id: string) {
  return request<{ ok: boolean }>(`/api/banking/reconciliation/candidates/${id}/reject`, {
    method: "POST",
  });
}

export async function getReconciliationRules() {
  return request<ReconciliationRules>("/api/banking/reconciliation/rules");
}

export async function updateReconciliationRules(data: Partial<ReconciliationRules>) {
  return request<{ ok: boolean; rules: ReconciliationRules }>("/api/banking/reconciliation/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
