/**
 * 账期与公司设置 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── 账期管理 ──────────────────────────────────────────────────────────────────

export interface AccountingPeriod {
  id: string;
  period: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  note: string | null;
  updatedAt: string;
}

export async function listAccountingPeriods() {
  return request<{ items: AccountingPeriod[]; total: number }>("/api/ledger/periods");
}

export async function lockPeriod(period: string) {
  return request<AccountingPeriod>(`/api/ledger/periods/${encodeURIComponent(period)}/lock`, {
    method: "POST"
  });
}

export async function unlockPeriod(period: string) {
  return request<AccountingPeriod>(`/api/ledger/periods/${encodeURIComponent(period)}/unlock`, {
    method: "POST"
  });
}

// ── 公司设置 ──────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string;
  name: string;
  registeredAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
  creditCode?: string;
  legalRepresentative?: string;
  bankName?: string;
  bankAccount?: string;
  financeApproverRole?: string;
  updatedAt?: string;
}

export async function getCompanyProfile() {
  return request<CompanyProfile>("/api/settings/company");
}

export async function updateCompanyProfile(data: Partial<Omit<CompanyProfile, "id">>) {
  return request<CompanyProfile>("/api/settings/company", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export interface AiProviderModel {
  id: string;
  name: string;
}

export interface AiProviderInfo {
  id: string;
  name: string;
  authType: "apiKey" | "none";
  models: AiProviderModel[];
  defaultBaseUrl: string;
  keyPlaceholder: string;
}

export interface AiConfigResponse {
  provider: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
  extraConfig: Record<string, string> | null;
  providers: AiProviderInfo[];
}

export async function getAiSettings() {
  return request<AiConfigResponse>("/api/settings/ai");
}

export async function updateAiSettings(data: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  extraConfig?: Record<string, string>;
}) {
  return request<AiConfigResponse>("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function getOllamaModels(baseUrl: string) {
  const params = new URLSearchParams({ baseUrl });
  return request<{ models: { name: string; size: number; modifiedAt: string }[] }>(
    `/api/settings/ai/ollama-models?${params.toString()}`
  );
}

export async function testAiConnection(data: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  return request<{ ok: boolean; note: string }>("/api/settings/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}
