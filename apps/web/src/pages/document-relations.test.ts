import type {
  DocumentAttachmentRecord,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildDocumentRelations,
  buildExpenseDocumentTemplateModel,
  buildPrintableDocumentHtml,
  supportsPrintableDocument
} from "./document-relations";
import {
  TEMPLATE_EMPTY_LIST_TEXT,
  TEMPLATE_EMPTY_VALUE,
  TemplateBulletList,
  TemplateCallout,
  TemplateKeyValueTable,
  TemplateSection,
  normalizeTemplateText
} from "./document-templates/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

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

const attachments: DocumentAttachmentRecord[] = [
  {
    id: "att-1",
    companyId: "company-1",
    documentId: "doc-1",
    fileName: "expense-receipt.pdf",
    fileType: "application/pdf",
    fileSize: 2048,
    uploadedAt: "2026-05-21T00:00:00.000Z"
  }
];

function testBuildDocumentRelations() {
  const relations = buildDocumentRelations({
    document,
    tasks,
    taxItems,
    vouchers
  });

  assert(relations.tasks.length === 1, "expected one related task");
  assert(relations.tasks[0]?.id === "task-1", "expected related task id");
  assert(relations.taxItems.length === 1, "expected one related tax item");
  assert(relations.taxItems[0]?.id === "tax-1", "expected related tax item id");
  assert(relations.vouchers.length === 1, "expected one related voucher");
  assert(relations.vouchers[0]?.id === "voucher-1", "expected related voucher id");
}

function testSupportsPrintableDocument() {
  assert(supportsPrintableDocument("expense_claim") === true, "expense claim should be printable");
  assert(supportsPrintableDocument("invoice_bundle") === true, "invoice bundle should be printable");
  assert(supportsPrintableDocument("supplier_invoice") === false, "supplier invoice should not be printable");
}

function testBuildExpenseDocumentTemplateModel() {
  const model = buildExpenseDocumentTemplateModel({
    document: {
      ...document,
      ownerDepartment: "",
      notes: "客户招待餐费与出租车费",
      attachments
    },
    tasks,
    taxItems,
    vouchers
  });

  assert(model.documentType === "expense_claim", "expected expense claim template model");
  assert(model.documentId === "doc-1", "expected normalized document id");
  assert(model.businessEventId === "evt-expense-1", "expected normalized business event id");
  assert(model.ownerDepartment === "—", "expected owner department fallback");
  assert(model.status === "draft", "expected normalized status");
  assert(model.createdOn === "2026-05-21", "expected normalized created date");
  assert(model.archivedOn === null, "expected null archived date when absent");
  assert(model.notes === "客户招待餐费与出租车费", "expected normalized notes");
  assert(model.attachments.length === 1, "expected normalized attachments");
  assert(model.attachments[0]?.id === "att-1", "expected attachment record to be preserved");
  assert(model.relationSummary.tasks.length === 1, "expected related tasks in template model");
  assert(model.relationSummary.taxItems.length === 1, "expected related tax items in template model");
  assert(model.relationSummary.vouchers.length === 1, "expected related vouchers in template model");
}

function testBuildPrintableDocumentHtmlUsesFormalSections() {
  const html = buildPrintableDocumentHtml({
    document: {
      ...document,
      ownerDepartment: "",
      archivedAt: null,
      notes: null,
      attachments
    },
    tasks,
    taxItems,
    vouchers
  });

  assert(html.includes("单据信息"), "expected base info section");
  assert(html.includes("<td>责任部门</td><td>—</td>"), "expected normalized owner department fallback in html");
  assert(html.includes("<td>归档日期</td><td>—</td>"), "expected normalized archived date fallback in html");
  assert(html.includes("<div class=\"note\">无</div>"), "expected normalized notes fallback in html");
  assert(html.includes("expense-receipt.pdf (application/pdf)"), "expected attachment content from normalized model");
  assert(html.includes("核对资料完整性｜财务部｜not_started"), "expected related task content");
  assert(!html.includes("无关任务"), "expected unrelated task to be excluded");
  assert(html.includes("企业所得税｜2026-05｜复核税前扣除凭证"), "expected related tax item content");
  assert(html.includes("voucher-1｜费用报销草稿｜review_required"), "expected related voucher content");
}

function testSharedExpenseTemplatePrimitives() {
  assert(TEMPLATE_EMPTY_VALUE === "—", "expected shared empty field fallback");
  assert(TEMPLATE_EMPTY_LIST_TEXT === "无", "expected shared empty list fallback");
  assert(normalizeTemplateText("") === "—", "expected empty string to normalize to field fallback");
  assert(
    normalizeTemplateText("已补充说明", TEMPLATE_EMPTY_LIST_TEXT) === "已补充说明",
    "expected non-empty text to be preserved"
  );

  const html = renderToStaticMarkup(
    createElement(
      TemplateSection,
      { title: "模板基础块" },
      createElement(TemplateKeyValueTable, {
        rows: [
          { label: "报销单号", value: normalizeTemplateText("EXP-001") },
          { label: "报销单号", value: normalizeTemplateText("EXP-001") },
          { label: "归档日期", value: normalizeTemplateText(null) }
        ]
      }),
      createElement(TemplateCallout, null, normalizeTemplateText("差旅与接待费用")),
      createElement(TemplateBulletList, { items: ["发票", "发票"] }),
      createElement(TemplateBulletList, { items: [] })
    )
  );

  assert(html.includes("<h2>模板基础块</h2>"), "expected shared section heading");
  assert(countOccurrences(html, "<td>报销单号</td><td>EXP-001</td>") === 2, "expected duplicate rows to render");
  assert(html.includes("归档日期</td><td>—</td>"), "expected normalized fallback value in table");
  assert(html.includes("差旅与接待费用"), "expected callout content");
  assert(countOccurrences(html, "<li>发票</li>") === 2, "expected duplicate list items to render");
  assert(html.includes("<li>无</li>"), "expected shared empty list fallback in list");
}

testBuildDocumentRelations();
testSupportsPrintableDocument();
testBuildExpenseDocumentTemplateModel();
testBuildPrintableDocumentHtmlUsesFormalSections();
testSharedExpenseTemplatePrimitives();

console.log("document-relations-ok");
