import type { ExportArchiveEntry, ExportArtifactKind, ExportJob } from "@finance-taxation/domain-model";

function nowIso() {
  return new Date().toISOString();
}

function normalizeArchiveSegment(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildExportJob(input: {
  companyId: string;
  userId: string | null;
  userName: string;
  kind: ExportArtifactKind;
  label: string;
  fileName: string;
  resourceType?: string | null;
  resourceId?: string | null;
  periodLabel?: string | null;
}): ExportJob {
  return {
    id: `export-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: input.companyId,
    kind: input.kind,
    label: input.label,
    fileName: input.fileName,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    periodLabel: input.periodLabel ?? null,
    status: "created",
    createdByUserId: input.userId,
    createdByName: input.userName,
    createdAt: nowIso()
  };
}

export function buildExportArchiveEntry(input: {
  companyId: string;
  jobId: string;
  kind: ExportArtifactKind;
  label: string;
  fileName: string;
  resourceType?: string | null;
  resourceId?: string | null;
  periodLabel?: string | null;
}): ExportArchiveEntry {
  const archiveKey = [
    normalizeArchiveSegment(input.kind),
    normalizeArchiveSegment(input.periodLabel),
    normalizeArchiveSegment(input.resourceType),
    normalizeArchiveSegment(input.resourceId)
  ]
    .filter(Boolean)
    .join(":");

  return {
    id: `export-archive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: input.companyId,
    jobId: input.jobId,
    archiveKey: archiveKey || normalizeArchiveSegment(input.kind),
    kind: input.kind,
    title: input.label,
    fileName: input.fileName,
    objectType: input.resourceType || input.kind,
    objectId: input.resourceId ?? null,
    periodLabel: input.periodLabel ?? null,
    createdAt: nowIso()
  };
}
