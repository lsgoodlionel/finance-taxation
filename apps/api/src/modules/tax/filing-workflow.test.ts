import test from "node:test";
import assert from "node:assert/strict";
import type { TaxFilingBatch, TaxFilingBatchArchiveRecord, TaxFilingBatchReviewRecord } from "@finance-taxation/domain-model";
import { buildArchiveRecord, buildReviewRecord, canArchiveBatch } from "./filing-workflow.js";

test("buildReviewRecord creates approved review entry", () => {
  const batch: TaxFilingBatch = {
    id: "batch-1",
    companyId: "cmp-1",
    taxType: "增值税",
    filingPeriod: "2026-05",
    status: "ready",
    itemIds: ["tx-1"],
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  const record: TaxFilingBatchReviewRecord = buildReviewRecord(batch, {
    userId: "u1",
    userName: "chairman",
    result: "approved",
    notes: "已复核"
  }, "2026-05-15T12:00:00.000Z");
  assert.equal(record.batchId, "batch-1");
  assert.equal(record.reviewResult, "approved");
});

test("canArchiveBatch only allows submitted batches", () => {
  assert.equal(canArchiveBatch("submitted"), true);
  assert.equal(canArchiveBatch("ready"), false);
});

test("buildArchiveRecord creates archive entry", () => {
  const batch: TaxFilingBatch = {
    id: "batch-2",
    companyId: "cmp-1",
    taxType: "企业所得税",
    filingPeriod: "2026-Q2",
    status: "submitted",
    itemIds: ["tx-2"],
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  const record: TaxFilingBatchArchiveRecord = buildArchiveRecord(batch, {
    userId: "u2",
    userName: "finance",
    label: "2026Q2-CIT"
  }, "2026-05-15T13:00:00.000Z");
  assert.equal(record.batchId, "batch-2");
  assert.equal(record.archiveLabel, "2026Q2-CIT");
});
