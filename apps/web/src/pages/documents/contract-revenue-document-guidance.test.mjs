import test from "node:test";
import assert from "node:assert/strict";
import { deriveContractRevenueDocumentGuidance } from "./contract-revenue-document-guidance.ts";

function detail(overrides = {}) {
  return {
    id: "doc-1",
    documentType: "acceptance_record",
    status: "awaiting_upload",
    ...overrides
  };
}

test("deriveContractRevenueDocumentGuidance detects missing acceptance guidance", () => {
  const guidance = deriveContractRevenueDocumentGuidance(detail(), [], [], []);
  assert.equal(guidance?.tone, "warning");
});

test("deriveContractRevenueDocumentGuidance detects duplicate revenue guidance", () => {
  const guidance = deriveContractRevenueDocumentGuidance(
    detail({ status: "ready" }),
    [{ title: "核对重复合同与收入主链" }],
    [{ taxType: "增值税" }],
    []
  );
  assert.equal(guidance?.tone, "error");
});

test("deriveContractRevenueDocumentGuidance detects deferred revenue guidance", () => {
  const guidance = deriveContractRevenueDocumentGuidance(
    detail({ documentType: "billing_schedule", status: "ready" }),
    [{ title: "拆分服务期间收入归属" }],
    [{ treatment: "分别复核销项税义务与所得税收入归属差异，并保留审计复核说明。" }],
    [{ id: "v-1" }]
  );
  assert.equal(guidance?.title, "当前单据已进入分期收入确认链");
});
