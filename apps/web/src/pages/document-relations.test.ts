import type {
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import {
  buildDocumentRelations,
  supportsPrintableDocument
} from "./document-relations";

const document: GeneratedDocument = {
  id: "doc-1",
  companyId: "company-1",
  businessEventId: "evt-expense-1",
  mappingId: "map-1",
  documentType: "expense_claim",
  title: "费用报销单",
  ownerDepartment: "行政部",
  status: "draft",
  attachmentIds: [],
  archivedAt: null,
  source: "analysis",
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z"
};

const tasks: Task[] = [
  {
    id: "task-1",
    companyId: "company-1",
    businessEventId: "evt-expense-1",
    parentTaskId: null,
    title: "核对资料完整性",
    description: "检查票据和回单",
    status: "not_started",
    priority: "high",
    ownerId: null,
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  },
  {
    id: "task-2",
    companyId: "company-1",
    businessEventId: "evt-other",
    parentTaskId: null,
    title: "无关任务",
    description: "",
    status: "not_started",
    priority: "low",
    ownerId: null,
    dueAt: null,
    assigneeDepartment: "财务部",
    source: "ai",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  }
];

const taxItems: TaxItem[] = [
  {
    id: "tax-1",
    companyId: "company-1",
    businessEventId: "evt-expense-1",
    mappingId: "tax-map-1",
    taxType: "企业所得税",
    treatment: "复核税前扣除凭证",
    basis: "票据与事由",
    filingPeriod: "2026-05",
    status: "review_required",
    source: "analysis",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  }
];

const vouchers: Voucher[] = [
  {
    id: "voucher-1",
    companyId: "company-1",
    businessEventId: "evt-expense-1",
    mappingId: "vou-map-1",
    voucherType: "payment",
    summary: "费用报销草稿",
    status: "review_required",
    lines: [],
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  }
];

function testBuildDocumentRelations() {
  const relations = buildDocumentRelations({
    document,
    tasks,
    taxItems,
    vouchers
  });

  console.assert(relations.tasks.length === 1, "expected one related task");
  console.assert(relations.tasks[0]?.id === "task-1", "expected related task id");
  console.assert(relations.taxItems.length === 1, "expected one related tax item");
  console.assert(relations.taxItems[0]?.id === "tax-1", "expected related tax item id");
  console.assert(relations.vouchers.length === 1, "expected one related voucher");
  console.assert(relations.vouchers[0]?.id === "voucher-1", "expected related voucher id");
}

function testSupportsPrintableDocument() {
  console.assert(supportsPrintableDocument("expense_claim") === true, "expense claim should be printable");
  console.assert(supportsPrintableDocument("invoice_bundle") === true, "invoice bundle should be printable");
  console.assert(supportsPrintableDocument("supplier_invoice") === false, "supplier invoice should not be printable");
}

testBuildDocumentRelations();
testSupportsPrintableDocument();

console.log("document-relations-ok");
