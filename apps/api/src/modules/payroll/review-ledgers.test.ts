import test from "node:test";
import assert from "node:assert/strict";
import type { PayrollRecord, TaxItem } from "@finance-taxation/domain-model";
import { buildPayrollTaxReviewLedgers } from "./review-ledgers.js";

const records: PayrollRecord[] = [
  {
    id: "pr-1",
    companyId: "cmp-1",
    period: "2026-05",
    employeeId: "emp-1",
    employeeName: "张三",
    grossSalary: 10000,
    socialSecurityEmployee: 1000,
    socialSecurityEmployer: 2000,
    housingFundEmployee: 500,
    housingFundEmployer: 500,
    iitWithheld: 300,
    netPay: 8200,
    status: "confirmed",
    confirmedAt: "2026-05-25T00:00:00.000Z",
    confirmedByUserId: "u1",
    confirmedByName: "admin",
    notes: "",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
];

const taxItems: TaxItem[] = [
  {
    id: "tax-iit",
    companyId: "cmp-1",
    businessEventId: "evt-payroll",
    mappingId: "map-iit",
    taxType: "个人所得税",
    treatment: "纳入工资薪金个税申报批次。",
    basis: "累计预扣",
    filingPeriod: "2026-05",
    status: "pending",
    source: "analysis",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  {
    id: "tax-social",
    companyId: "cmp-1",
    businessEventId: "evt-payroll",
    mappingId: "map-social",
    taxType: "社保公积金",
    treatment: "生成缴费台账。",
    basis: "按在职人数和基数",
    filingPeriod: "2026-05",
    status: "pending",
    source: "analysis",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
];

test("buildPayrollTaxReviewLedgers builds three ledgers with payroll totals", () => {
  const ledgers = buildPayrollTaxReviewLedgers({
    companyId: "cmp-1",
    period: "2026-05",
    businessEventId: "evt-payroll",
    records,
    taxItems
  });

  assert.equal(ledgers.length, 3);
  assert.equal(ledgers[0]?.status, "ready");
  assert.deepEqual(
    ledgers.map((item) => [item.reviewType, item.totalEmployeeAmount, item.totalEmployerAmount]),
    [
      ["iit", "300.00", "0.00"],
      ["social_security", "1000.00", "2000.00"],
      ["housing_fund", "500.00", "500.00"]
    ]
  );
});

test("buildPayrollTaxReviewLedgers marks ledgers pending without linked event", () => {
  const ledgers = buildPayrollTaxReviewLedgers({
    companyId: "cmp-1",
    period: "2026-05",
    businessEventId: null,
    records,
    taxItems: []
  });

  assert.ok(ledgers.every((item) => item.status === "pending"));
});
