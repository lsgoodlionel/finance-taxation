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
