import test from "node:test";
import assert from "node:assert/strict";
import type { GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import { buildContractObjectLinks } from "./links.js";

const tasks: Task[] = [
  {
    id: "task-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    parentTaskId: null,
    title: "开票申请",
    description: "处理开票",
    status: "not_started",
    priority: "high",
    ownerId: "u-1",
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai",
    createdAt: "2026-05-25T10:00:00.000Z",
    updatedAt: "2026-05-25T10:00:00.000Z"
  }
];

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
    createdAt: "2026-05-25T10:00:00.000Z",
    updatedAt: "2026-05-25T10:00:00.000Z"
  }
];

const taxItems: TaxItem[] = [
  {
    id: "tax-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    mappingId: "map-tax-1",
    taxType: "增值税",
    treatment: "确认销项税",
    basis: "按开票节点确认",
    filingPeriod: "2026-05",
    status: "pending",
    source: "analysis",
    createdAt: "2026-05-25T10:00:00.000Z",
    updatedAt: "2026-05-25T10:00:00.000Z"
  }
];

const vouchers: Voucher[] = [
  {
    id: "vou-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    mappingId: "map-vou-1",
    voucherType: "accrual",
    summary: "收入确认草稿",
    status: "review_required",
    lines: [],
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: "2026-05-25T10:00:00.000Z",
    updatedAt: "2026-05-25T10:00:00.000Z"
  }
];

test("buildContractObjectLinks creates one link per related object", () => {
  const links = buildContractObjectLinks({
    companyId: "cmp-1",
    contractId: "contract-1",
    businessEventId: "evt-1",
    tasks,
    documents,
    taxItems,
    vouchers
  });

  assert.equal(links.length, 4);
  assert.deepEqual(
    links.map((item) => [item.objectType, item.objectId]),
    [
      ["task", "task-1"],
      ["document", "doc-1"],
      ["tax_item", "tax-1"],
      ["voucher", "vou-1"]
    ]
  );
});
