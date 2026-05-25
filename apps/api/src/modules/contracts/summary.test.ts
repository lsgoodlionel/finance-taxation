import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@finance-taxation/domain-model";
import type { GeneratedDocument, TaxItem, Voucher } from "@finance-taxation/domain-model";
import { buildContractWorkspaceSummary } from "./summary.js";

const eventIds = ["evt-1", "evt-2"];

const documents: GeneratedDocument[] = [
  {
    id: "doc-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    mappingId: "map-1",
    documentType: "invoice_application",
    title: "开票申请与客户开票信息",
    ownerDepartment: "财务部",
    status: "ready",
    attachmentIds: [],
    archivedAt: null,
    source: "analysis",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  }
];

const taxItems: TaxItem[] = [
  {
    id: "tax-1",
    companyId: "cmp-1",
    businessEventId: "evt-2",
    mappingId: "tax-map-1",
    taxType: "增值税",
    treatment: "确认销项税",
    basis: "按开票节点确认",
    filingPeriod: "2026-05",
    status: "pending",
    source: "analysis",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z"
  }
];

const vouchers: Voucher[] = [
  {
    id: "vou-1",
    companyId: "cmp-1",
    businessEventId: "evt-2",
    mappingId: "vou-map-1",
    voucherType: "accrual",
    summary: "收入确认草稿",
    status: "review_required",
    lines: [],
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z"
  }
];

const tasks: Task[] = [
  {
    id: "task-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    parentTaskId: null,
    title: "经营事项执行主任务",
    description: "统筹执行",
    status: "not_started",
    priority: "high",
    ownerId: "u1",
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z"
  }
];

test("buildContractWorkspaceSummary aggregates related documents tax items and vouchers", () => {
  const summary = buildContractWorkspaceSummary({
    relatedEventIds: eventIds,
    documents,
    taxItems,
    vouchers,
    tasks
  });

  assert.equal(summary.documents.length, 1);
  assert.equal(summary.documents[0]?.id, "doc-1");
  assert.equal(summary.taxItems.length, 1);
  assert.equal(summary.taxItems[0]?.id, "tax-1");
  assert.equal(summary.vouchers.length, 1);
  assert.equal(summary.vouchers[0]?.id, "vou-1");
  assert.equal(summary.tasks.length, 1);
  assert.equal(summary.tasks[0]?.id, "task-1");
});

test("buildContractWorkspaceSummary excludes objects outside the contract events", () => {
  const summary = buildContractWorkspaceSummary({
    relatedEventIds: ["evt-1"],
    documents,
    taxItems,
    vouchers,
    tasks
  });

  assert.equal(summary.documents.length, 1);
  assert.equal(summary.taxItems.length, 0);
  assert.equal(summary.vouchers.length, 0);
  assert.equal(summary.tasks.length, 1);
});

test("buildContractWorkspaceSummary includes explicitly linked objects and de-duplicates them", () => {
  const summary = buildContractWorkspaceSummary({
    relatedEventIds: [],
    linkedObjectIds: {
      documentIds: ["doc-1"],
      taxItemIds: ["tax-1"],
      voucherIds: ["vou-1"],
      taskIds: ["task-1"]
    },
    documents,
    taxItems,
    vouchers,
    tasks
  });

  assert.equal(summary.documents.length, 1);
  assert.equal(summary.taxItems.length, 1);
  assert.equal(summary.vouchers.length, 1);
  assert.equal(summary.tasks.length, 1);
});
