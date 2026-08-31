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
  /**
   * 税收资格（V17 阶段三）。决定企业所得税按 25% / 15% / 5% 哪一档算。
   *
   * **`null` 是「没登记」，不是 0。** 判定层据此报「优惠资格待确认」，
   * 而不是替用户按 25% 算——那会让本该按 5% 的小微企业多交五倍。
   */
  employeeCount?: number | null;
  /** 资产总额（分）。界面上按元显示。 */
  totalAssetsCents?: number | null;
  isRestrictedIndustry?: boolean;
  /** 高新资质有效期止日。存止日而不是布尔值：资质会过期。 */
  highTechCertificateExpiresOn?: string | null;
  /** 城建税所在地档位：city 7% / county 5% / other 1%。 */
  urbanConstructionTaxZone?: string | null;
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
