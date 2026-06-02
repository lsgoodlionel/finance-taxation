import type { GeneratedDocument } from "@finance-taxation/domain-model";

export const DOC_STATUS_ORDER = [
  "draft",
  "awaiting_upload",
  "ready",
  "archived"
] as const;

export const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  awaiting_upload: "#d97706",
  ready: "#1a7f5a",
  archived: "#6b7280"
};

export interface StatusBucket {
  status: string;
  count: number;
}

export interface DocumentsSummary {
  total: number;
  archivedCount: number;
  pendingUploadCount: number;
  statusBreakdown: StatusBucket[];
}

/**
 * 单据中心概览：总数、已归档数、缺附件待上传数、按状态分布。
 * summary-first 工作台核心数据，保持纯函数以便测试。
 */
export function buildDocumentsSummary(documents: GeneratedDocument[]): DocumentsSummary {
  const archivedCount = documents.filter((d) => d.status === "archived").length;
  const pendingUploadCount = documents.filter(
    (d) => d.status !== "archived" && d.attachmentIds.length === 0
  ).length;

  const statusBreakdown = DOC_STATUS_ORDER.map((status) => ({
    status,
    count: documents.filter((d) => d.status === status).length
  })).filter((bucket) => bucket.count > 0);

  return {
    total: documents.length,
    archivedCount,
    pendingUploadCount,
    statusBreakdown
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}
