/**
 * 社保联动 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import type {
  AuditLog
} from "@finance-taxation/domain-model";
import {
  request
} from "./client";

// ── P4 社保联动 ───────────────────────────────────────────────────────────────

export async function closeSocialSecurity(period: string) {
  return request<{
    ok: boolean; eventId: string; taskId: string; voucherIds: string[];
    summary: { period: string; socialSecurityEmployer: number; socialSecurityEmployee: number; housingFundEmployer: number; housingFundEmployee: number };
  }>(`/api/payroll/periods/${encodeURIComponent(period)}/social-security-closure`, {
    method: "POST", body: JSON.stringify({})
  });
}

export async function getRndTrend(months?: number) {
  const q = months ? `?months=${months}` : "";
  return request<{
    trend: Array<{ month: string; expensed: number; capitalized: number; total: number }>;
    months: number;
    detail: Array<{ month: string; costType: string; accountingTreatment: string; total: number }>;
  }>(`/api/rnd/trend${q}`);
}

export async function listAuditLogs(params?: {
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.resourceType) q.set("resourceType", params.resourceType);
  if (params?.resourceId) q.set("resourceId", params.resourceId);
  if (params?.userId) q.set("userId", params.userId);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return request<{ items: AuditLog[]; total: number; limit: number; offset: number }>(
    `/api/audit/logs${qs ? "?" + qs : ""}`
  );
}
