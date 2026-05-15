import type {
  TaxFilingBatch,
  TaxFilingBatchArchiveRecord,
  TaxFilingBatchReviewRecord,
  TaxFilingBatchStatus
} from "@finance-taxation/domain-model";

export function buildReviewRecord(
  batch: TaxFilingBatch,
  input: { userId: string | null; userName: string; result: "approved" | "rejected"; notes: string },
  reviewedAt: string
): TaxFilingBatchReviewRecord {
  return {
    id: `tax-review-${Date.now()}`,
    companyId: batch.companyId,
    batchId: batch.id,
    reviewedByUserId: input.userId,
    reviewedByName: input.userName,
    reviewResult: input.result,
    reviewNotes: input.notes,
    reviewedAt
  };
}

export function canArchiveBatch(status: TaxFilingBatchStatus): boolean {
  return status === "submitted";
}

export function buildArchiveRecord(
  batch: TaxFilingBatch,
  input: { userId: string | null; userName: string; label: string; notes?: string },
  archivedAt: string
): TaxFilingBatchArchiveRecord {
  return {
    id: `tax-archive-${Date.now()}`,
    companyId: batch.companyId,
    batchId: batch.id,
    archivedByUserId: input.userId,
    archivedByName: input.userName,
    archiveLabel: input.label,
    archiveNotes: input.notes || "",
    archivedAt
  };
}
