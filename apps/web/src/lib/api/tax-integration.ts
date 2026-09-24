/**
 * 申报导出 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  getStoredToken,
  request
} from "./client";

// ─── P1: Tax Integration — Declaration Export ─────────────────────────────────

/** 下载申报文件（返回 Blob URL，由调用方触发浏览器下载） */
export async function downloadDeclarationFile(
  type: "vat-xml" | "iit-csv" | "si-csv" | "fund-csv",
  period: string,
): Promise<{ blobUrl: string; fileName: string }> {
  const token = getStoredToken();
  const res = await fetch(
    `/api/tax-integration/${type}?period=${encodeURIComponent(period)}`,
    { headers: { Authorization: `Bearer ${token ?? ""}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "下载失败" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const nameMatch = disposition.match(/filename="?([^";]+)"?/);
  const fileName = nameMatch?.[1] ? decodeURIComponent(nameMatch[1]) : `${type}-${period}`;
  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), fileName };
}

export async function listDeclarationSubmissions(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ items: DeclarationSubmission[]; total: number }>(
    `/api/tax-integration/submissions${q}`,
  );
}

export async function confirmDeclarationSubmission(id: string, submissionRef?: string) {
  return request<{ ok: boolean }>(`/api/tax-integration/submissions/${id}/confirm`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionRef }),
  });
}

export interface DeclarationSubmission {
  id: string;
  taxType: string;       // 'vat'|'iit'|'si'|'housing_fund'
  filingPeriod: string;
  submissionMode: string;
  fileFormat: string;
  fileName: string;
  submissionRef: string | null;
  status: "generated" | "uploaded" | "confirmed" | "rejected";
  errorMessage: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  createdByName: string;
  createdAt: string;
}
