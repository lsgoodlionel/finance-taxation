import test from "node:test";
import assert from "node:assert/strict";
import { deriveTravelDocumentGuidance } from "./travel-document-guidance.ts";

function detail(overrides = {}) {
  return {
    id: "doc-1",
    documentType: "hotel_invoice",
    status: "awaiting_upload",
    ...overrides
  };
}

test("deriveTravelDocumentGuidance detects missing hotel invoice guidance", () => {
  const guidance = deriveTravelDocumentGuidance(detail(), [], [], []);
  assert.equal(guidance?.tone, "warning");
});

test("deriveTravelDocumentGuidance detects duplicate travel reimbursement guidance", () => {
  const guidance = deriveTravelDocumentGuidance(
    detail({ status: "ready" }),
    [{ title: "核对重复差旅报销记录" }],
    [{ taxType: "增值税" }],
    []
  );
  assert.equal(guidance?.tone, "error");
});

test("deriveTravelDocumentGuidance detects cross-period travel guidance", () => {
  const guidance = deriveTravelDocumentGuidance(
    detail({ documentType: "travel_request", status: "ready" }),
    [{ title: "拆分跨期差旅归属月份" }],
    [{ treatment: "按实际归属期拆分差旅费用并复核税前扣除月份。" }],
    [{ id: "v-1" }]
  );
  assert.equal(guidance?.title, "当前单据已进入跨期差旅处理链");
});
