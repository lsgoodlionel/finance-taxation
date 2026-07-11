import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent, LedgerEntry, RndProject, Task, Voucher } from "@finance-taxation/domain-model";
import { evaluateRiskFindings } from "./engine.js";

test("evaluateRiskFindings emits sales and execution findings for the current event", () => {
  const salesEvent: BusinessEvent = {
    id: "evt-sales",
    companyId: "cmp-1",
    type: "sales",
    title: "销售收入确认",
    description: "",
    department: "销售部",
    ownerId: "u1",
    occurredOn: "2026-05-15",
    amount: "1000.00",
    currency: "CNY",
    status: "posted",
    source: "manual",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };

  const rndEvent: BusinessEvent = {
    id: "evt-rnd",
    companyId: "cmp-1",
    type: "rnd",
    title: "研发投入",
    description: "",
    department: "研发部",
    ownerId: "u2",
    occurredOn: "2026-05-15",
    amount: "300.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-05-15T12:00:00.000Z",
    event: salesEvent,
    events: [
      salesEvent,
      rndEvent
    ],
    tasks: [
      {
        id: "task-tax",
        companyId: "cmp-1",
        businessEventId: "evt-sales",
        parentTaskId: null,
        title: "申报任务",
        description: "",
        status: "blocked",
        priority: "high",
        ownerId: "u1",
        dueAt: "2026-05-01T00:00:00.000Z",
        assigneeDepartment: "财务部",
        source: "ai",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    vouchers: [
      {
        id: "v-1",
        companyId: "cmp-1",
        businessEventId: "evt-sales",
        mappingId: "m-1",
        voucherType: "accrual",
        summary: "销售凭证",
        status: "posted",
        lines: [],
        approvedAt: "2026-05-15T00:00:00.000Z",
        postedAt: "2026-05-15T00:00:00.000Z",
        source: "analysis",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    ledgerEntries: [
      {
        id: "le-1",
        companyId: "cmp-1",
        voucherId: "v-1",
        businessEventId: "evt-sales",
        entryDate: "2026-05-15",
        summary: "收入",
        accountCode: "6001",
        accountName: "主营业务收入",
        debit: "0.00",
        credit: "1000.00",
        source: "voucher_posting",
        postedAt: "2026-05-15T00:00:00.000Z"
      },
      {
        id: "le-2",
        companyId: "cmp-1",
        voucherId: "v-2",
        businessEventId: "evt-rnd",
        entryDate: "2026-05-15",
        summary: "研发费用",
        accountCode: "1801001",
        accountName: "研发支出-费用化支出",
        debit: "300.00",
        credit: "0.00",
        source: "voucher_posting",
        postedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    rndProjects: [] as RndProject[],
    generatedDocumentsAll: []
  });

  assert.equal(findings.some((item) => item.ruleCode === "SALES_WITHOUT_VAT_ITEM"), true);
  assert.equal(findings.some((item) => item.ruleCode === "POSTED_VOUCHER_WITHOUT_DOCUMENT"), true);
  assert.equal(findings.some((item) => item.ruleCode === "OVERDUE_BLOCKED_TASK"), true);
});

test("evaluateRiskFindings emits R&D project finding for the current rnd event", () => {
  const rndEvent: BusinessEvent = {
    id: "evt-rnd",
    companyId: "cmp-1",
    type: "rnd",
    title: "研发投入",
    description: "",
    department: "研发部",
    ownerId: "u2",
    occurredOn: "2026-05-15",
    amount: "300.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-05-15T12:00:00.000Z",
    event: rndEvent,
    events: [rndEvent],
    tasks: [] as Task[],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [] as Voucher[],
    ledgerEntries: [
      {
        id: "le-2",
        companyId: "cmp-1",
        voucherId: "v-2",
        businessEventId: "evt-rnd",
        entryDate: "2026-05-15",
        summary: "研发费用",
        accountCode: "1801001",
        accountName: "研发支出-费用化支出",
        debit: "300.00",
        credit: "0.00",
        source: "voucher_posting",
        postedAt: "2026-05-15T00:00:00.000Z"
      }
    ] as LedgerEntry[],
    rndProjects: [] as RndProject[]
  });

  assert.equal(findings.some((item) => item.ruleCode === "RND_EVENT_WITHOUT_PROJECT"), true);
});

test("evaluateRiskFindings emits payroll compliance findings", () => {
  const payrollEvent: BusinessEvent = {
    id: "evt-payroll",
    companyId: "cmp-1",
    type: "payroll",
    title: "工资发放",
    description: "",
    department: "人事部",
    ownerId: "u3",
    occurredOn: "2026-05-15",
    amount: "5000.00",
    currency: "CNY",
    status: "posted",
    source: "manual",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-05-15T12:00:00.000Z",
    event: payrollEvent,
    events: [payrollEvent],
    tasks: [] as Task[],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [
      {
        id: "le-payroll",
        companyId: "cmp-1",
        voucherId: "v-payroll",
        businessEventId: "evt-payroll",
        entryDate: "2026-05-15",
        summary: "工资计提",
        accountCode: "22110101",
        accountName: "应付职工薪酬-工资",
        debit: "0.00",
        credit: "5000.00",
        source: "voucher_posting",
        postedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    rndProjects: []
  });

  assert.equal(findings.some((item) => item.ruleCode === "PAYROLL_WITHOUT_IIT_ITEM"), true);
  assert.equal(findings.some((item) => item.ruleCode === "PAYROLL_WITHOUT_SOCIAL_OBLIGATION"), true);
  assert.equal(findings.some((item) => item.ruleCode === "PAYROLL_WITHOUT_HOUSING_FUND_SUPPORT"), true);
});

test("evaluateRiskFindings expands sales and procurement closure checks", () => {
  const salesEvent: BusinessEvent = {
    id: "evt-sales2",
    companyId: "cmp-1",
    type: "sales",
    title: "销售确认",
    description: "",
    department: "销售部",
    ownerId: "u1",
    occurredOn: "2026-05-15",
    amount: "2000",
    currency: "CNY",
    status: "posted",
    source: "manual",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-05-15T12:00:00.000Z",
    event: salesEvent,
    events: [salesEvent],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [
      {
        id: "v-1",
        companyId: "cmp-1",
        businessEventId: "evt-sales2",
        mappingId: "m-1",
        voucherType: "accrual",
        summary: "销售凭证",
        status: "posted",
        lines: [],
        approvedAt: "2026-05-15T00:00:00.000Z",
        postedAt: "2026-05-15T00:00:00.000Z",
        source: "analysis",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    ledgerEntries: [
      {
        id: "le-1",
        companyId: "cmp-1",
        voucherId: "v-1",
        businessEventId: "evt-sales2",
        entryDate: "2026-05-15",
        summary: "收入",
        accountCode: "6001",
        accountName: "主营业务收入",
        debit: "0",
        credit: "2000",
        source: "voucher_posting",
        postedAt: "2026-05-15T00:00:00.000Z"
      }
    ],
    rndProjects: []
  });

  assert.equal(findings.some((item) => item.ruleCode === "SALES_WITHOUT_CONTRACT_DOCUMENT"), true);
  assert.equal(findings.some((item) => item.ruleCode === "SALES_WITHOUT_RECEIPT_EVIDENCE"), true);
});

test("evaluateRiskFindings emits travel expense exception findings", () => {
  const travelEvent: BusinessEvent = {
    id: "evt-travel",
    companyId: "cmp-1",
    type: "travel_expense" as unknown as BusinessEvent["type"],
    title: "跨期差旅报销计入错误月份",
    description: JSON.stringify({
      input: { providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"] },
      expected: {
        classification: "travel_expense_accrual",
        documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
        exceptions: ["accounting_period_conflict"],
        risks: ["cutoff_misstatement"]
      }
    }),
    department: "销售部",
    ownerId: "u-travel",
    occurredOn: "2026-05-03",
    amount: "6920.00",
    currency: "CNY",
    status: "posted",
    source: "manual",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-05-15T12:00:00.000Z",
    event: travelEvent,
    events: [travelEvent],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [],
    rndProjects: []
  });

  assert.equal(findings.some((item) => item.ruleCode === "CUTOFF_MISSTATEMENT"), true);
});

test("evaluateRiskFindings emits contract revenue exception findings", () => {
  const event: BusinessEvent = {
    id: "evt-contract-revenue",
    companyId: "cmp-1",
    type: "contract_revenue" as unknown as BusinessEvent["type"],
    title: "跨期订阅服务一次性确认收入",
    description: JSON.stringify({
      input: { serviceStart: "2026-06-01", serviceEnd: "2027-05-31", claimedRecognition: "upfront" },
      expected: {
        classification: "deferred_subscription_revenue",
        documentTypes: ["service_contract", "billing_schedule", "output_invoice"],
        exceptions: ["revenue_timing_conflict"],
        risks: ["premature_revenue_recognition", "tax_accounting_timing_difference"]
      }
    }),
    department: "人事部",
    ownerId: "u-contract",
    occurredOn: "2026-06-01",
    amount: "240000.00",
    currency: "CNY",
    status: "posted",
    source: "manual",
    contractId: "contract-1",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };

  const findings = evaluateRiskFindings({
    now: "2026-06-15T12:00:00.000Z",
    event,
    events: [event],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [],
    rndProjects: []
  });

  assert.equal(findings.some((item) => item.ruleCode === "PREMATURE_REVENUE_RECOGNITION"), true);
  assert.equal(findings.some((item) => item.ruleCode === "TAX_ACCOUNTING_TIMING_DIFFERENCE"), true);
});

test("evaluateRiskFindings emits purchase expense exception findings from acceptance metadata", () => {
  const missingInvoiceEvent: BusinessEvent = {
    id: "PUR-MISSING-001",
    companyId: "cmp-1",
    type: "purchase_expense" as unknown as BusinessEvent["type"],
    title: "客户活动用品采购缺少发票",
    description: JSON.stringify({
      input: { providedDocumentTypes: ["expense_claim"] },
      expected: {
        classification: "sales_expense",
        documentTypes: ["expense_claim", "invoice_bundle"],
        exceptions: ["missing_invoice_bundle"],
        risks: ["unsupported_tax_deduction"]
      }
    }),
    department: "销售部",
    ownerId: "u1",
    occurredOn: "2026-04-10",
    amount: "860.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z"
  };

  const duplicateEvent: BusinessEvent = {
    id: "PUR-DUP-001",
    companyId: "cmp-1",
    type: "purchase_expense" as unknown as BusinessEvent["type"],
    title: "重复提交办公耗材采购",
    description: JSON.stringify({
      input: { providedDocumentTypes: ["expense_claim", "invoice_bundle"] },
      expected: {
        classification: "low_value_consumable",
        documentTypes: ["expense_claim", "invoice_bundle"],
        exceptions: ["duplicate_invoice"],
        risks: ["duplicate_reimbursement"]
      }
    }),
    department: "销售部",
    ownerId: "u1",
    occurredOn: "2026-04-08",
    amount: "1280.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z"
  };

  const misclassifiedAssetEvent: BusinessEvent = {
    id: "PUR-CLASS-001",
    companyId: "cmp-1",
    type: "purchase_expense" as unknown as BusinessEvent["type"],
    title: "高价值研发工作站误分类办公用品",
    description: JSON.stringify({
      input: {
        providedDocumentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
        claimedClassification: "office_supplies"
      },
      expected: {
        classification: "fixed_asset",
        documentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
        exceptions: ["classification_conflict"],
        risks: ["expense_overstatement"]
      }
    }),
    department: "销售部",
    ownerId: "u2",
    occurredOn: "2026-04-18",
    amount: "26800.00",
    currency: "CNY",
    status: "needs_review" as unknown as BusinessEvent["status"],
    source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"],
    createdAt: "2026-04-18T00:00:00.000Z",
    updatedAt: "2026-04-18T00:00:00.000Z"
  };

  const missingFindings = evaluateRiskFindings({
    now: "2026-04-20T12:00:00.000Z",
    event: missingInvoiceEvent,
    events: [missingInvoiceEvent],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [],
    rndProjects: []
  });
  assert.equal(missingFindings.some((item) => item.ruleCode === "UNSUPPORTED_TAX_DEDUCTION"), true);

  const duplicateFindings = evaluateRiskFindings({
    now: "2026-04-20T12:00:00.000Z",
    event: duplicateEvent,
    events: [duplicateEvent],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [],
    rndProjects: []
  });
  assert.equal(duplicateFindings.some((item) => item.ruleCode === "DUPLICATE_REIMBURSEMENT"), true);

  const classificationFindings = evaluateRiskFindings({
    now: "2026-04-20T12:00:00.000Z",
    event: misclassifiedAssetEvent,
    events: [misclassifiedAssetEvent],
    tasks: [],
    taxItems: [],
    taxFilingBatches: [],
    generatedDocuments: [],
    generatedDocumentsAll: [],
    vouchers: [],
    ledgerEntries: [],
    rndProjects: []
  });
  assert.equal(classificationFindings.some((item) => item.ruleCode === "EXPENSE_OVERSTATEMENT"), true);
});
