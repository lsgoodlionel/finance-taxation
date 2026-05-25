import type { PayrollRecord, RiskFinding, Voucher } from "@finance-taxation/domain-model";
import {
  buildPayrollRiskBuckets,
  buildPayrollVoucherSuggestions
} from "./payroll-guidance";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectTrue(value: boolean, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

const records: PayrollRecord[] = [
  {
    id: "pr-1",
    companyId: "cmp-1",
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

const voucherSuggestions = buildPayrollVoucherSuggestions(records, []);
expectEqual(voucherSuggestions.length, 4, "payroll guidance should expose four default voucher suggestions");
expectTrue(voucherSuggestions.some((item) => item.key === "payroll_accrual"), "payroll accrual suggestion should exist");
expectTrue(voucherSuggestions.some((item) => item.key === "iit_withholding"), "iit withholding suggestion should exist");

const existingVouchers: Voucher[] = [
  {
    id: "vou-1",
    companyId: "cmp-1",
    businessEventId: "evt-payroll-1",
    mappingId: "map-1",
    voucherType: "accrual",
    summary: "工资计提凭证",
    status: "posted",
    lines: [],
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: "",
    updatedAt: ""
  }
];

const reducedSuggestions = buildPayrollVoucherSuggestions(records, existingVouchers);
expectEqual(reducedSuggestions.length, 3, "existing payroll accrual voucher should suppress duplicate suggestion");

const riskBuckets = buildPayrollRiskBuckets([
  {
    id: "risk-1",
    companyId: "cmp-1",
    businessEventId: "evt-payroll-1",
    ruleCode: "PAYROLL_IIT_MISSING",
    severity: "high",
    priority: "P1",
    status: "open",
    title: "缺少个税处理",
    detail: "",
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "risk-2",
    companyId: "cmp-1",
    businessEventId: "evt-payroll-1",
    ruleCode: "PAYROLL_SOCIAL_MISSING",
    severity: "medium",
    priority: "P2",
    status: "open",
    title: "缺少社保处理",
    detail: "",
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "risk-3",
    companyId: "cmp-1",
    businessEventId: "evt-payroll-1",
    ruleCode: "PAYROLL_HOUSING_MISSING",
    severity: "medium",
    priority: "P2",
    status: "open",
    title: "缺少公积金资料",
    detail: "",
    createdAt: "",
    updatedAt: ""
  }
] satisfies RiskFinding[]);

expectEqual(riskBuckets.iit.length, 1, "iit bucket should capture IIT risks");
expectEqual(riskBuckets.socialSecurity.length, 1, "social security bucket should capture social risks");
expectEqual(riskBuckets.housingFund.length, 1, "housing fund bucket should capture housing risks");

console.log("payroll-guidance-ok");
