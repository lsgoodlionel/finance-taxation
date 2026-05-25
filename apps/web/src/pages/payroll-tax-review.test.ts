import type { IndividualIncomeTaxMaterial, PayrollRecord } from "@finance-taxation/domain-model";
import { buildPayrollTaxReviewSummary } from "./payroll-tax-review";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const records: PayrollRecord[] = [
  {
    id: "pr-1",
    companyId: "company-1",
    period: "2026-05",
    employeeId: "emp-1",
    employeeName: "张三",
    grossSalary: 10000,
    socialSecurityEmployee: 800,
    socialSecurityEmployer: 1600,
    housingFundEmployee: 600,
    housingFundEmployer: 600,
    iitWithheld: 120,
    netPay: 8480,
    status: "confirmed",
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: "",
    notes: "",
    createdAt: "",
    updatedAt: ""
  }
];

const material: IndividualIncomeTaxMaterial = {
  companyId: "company-1",
  filingPeriod: "2026-05",
  payrollEventCount: 1,
  withholdingItemCount: 2,
  totalPayrollAmount: "10000",
  checklist: ["工资表与个税申报名单", "银行代发工资流水"]
};

const ready = buildPayrollTaxReviewSummary({
  period: "2026-05",
  records,
  linkedEventId: "evt-payroll-1",
  taxItemCount: 3,
  iitMaterial: material
});

assert(ready.status === "ready", "expected ready status when event and IIT materials are present");
assert(ready.highlights[0] === "员工个税合计 120.00 元", "expected IIT highlight");
assert(ready.highlights[1] === "个人社保合计 800.00 元", "expected social security highlight");
assert(ready.highlights[2] === "个人公积金合计 600.00 元", "expected housing fund highlight");
assert(ready.pendingActions.length === 0, "expected no pending actions");

const missing = buildPayrollTaxReviewSummary({
  period: "2026-05",
  records,
  linkedEventId: null,
  taxItemCount: 0,
  iitMaterial: null
});

assert(missing.status === "pending", "expected pending status when linkage is missing");
assert(missing.pendingActions.includes("生成工资事项并同步税务"), "expected event creation action");
assert(missing.pendingActions.includes("生成个税申报资料"), "expected IIT material action");

console.log("payroll-tax-review-ok");
