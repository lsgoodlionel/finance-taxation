import test from "node:test";
import assert from "node:assert/strict";
import { derivePurchaseDocumentGuidance } from "./purchase-document-guidance.ts";

function task(title) {
  return {
    id: title,
    companyId: "cmp-1",
    businessEventId: "evt-1",
    parentTaskId: null,
    title,
    description: "",
    status: "not_started",
    priority: "high",
    ownerId: null,
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai"
  };
}

function detail(overrides = {}) {
  return {
    id: "doc-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    mappingId: "map-1",
    documentType: "invoice_bundle",
    title: "报销票据包",
    ownerDepartment: "财务部",
    status: "awaiting_upload",
    attachmentIds: [],
    archivedAt: null,
    source: "analysis",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    notes: null,
    attachments: [],
    ...overrides
  };
}

test("derivePurchaseDocumentGuidance detects missing invoice guidance", () => {
  const guidance = derivePurchaseDocumentGuidance(detail(), [], [], []);
  assert.equal(guidance?.tone, "warning");
  assert.match(guidance?.title ?? "", /缺票/);
});

test("derivePurchaseDocumentGuidance detects duplicate reimbursement guidance", () => {
  const guidance = derivePurchaseDocumentGuidance(
    detail({ status: "ready" }),
    [task("核对重复票据与历史报销")],
    [{ id: "tax-1", companyId: "cmp-1", businessEventId: "evt-1", mappingId: "m", taxType: "增值税", treatment: "", basis: "", filingPeriod: "2026-06", status: "review_required", source: "analysis", createdAt: "", updatedAt: "" }],
    []
  );
  assert.equal(guidance?.tone, "error");
  assert.match(guidance?.title ?? "", /重复报销/);
});

test("derivePurchaseDocumentGuidance detects asset reclassification guidance", () => {
  const guidance = derivePurchaseDocumentGuidance(
    detail({ documentType: "purchase_request", title: "资产购置申请单", status: "ready" }),
    [task("改走固定资产审批链")],
    [],
    [{ id: "v-1", companyId: "cmp-1", businessEventId: "evt-1", mappingId: "m", voucherType: "payment", summary: "", status: "review_required", lines: [], approvedAt: null, postedAt: null, source: "analysis", createdAt: "", updatedAt: "" }]
  );
  assert.equal(guidance?.tone, "warning");
  assert.match(guidance?.title ?? "", /固定资产/);
});
