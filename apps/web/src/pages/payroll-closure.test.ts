import type { BusinessEvent, RiskFinding, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  buildPayrollArtifactSummary,
  resolvePayrollLinkedEventId
} from "./payroll-closure";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const payrollEvent: BusinessEvent = {
  id: "evt-payroll-1",
  companyId: "company-1",
  type: "payroll",
  title: "2026-05 工资计提与薪酬发放事项",
  description: "",
  department: "人事行政部",
  ownerId: null,
  occurredOn: "2026-05-01",
  amount: "20000.00",
  currency: "CNY",
  status: "analyzed",
  source: "manual"
};

assert(
  resolvePayrollLinkedEventId("2026-05", { "2026-05": "evt-manual" }, [payrollEvent]) === "evt-manual",
  "manual period mapping should win over inferred event matching"
);
assert(
  resolvePayrollLinkedEventId("2026-05", {}, [payrollEvent]) === "evt-payroll-1",
  "matching payroll event title should restore linked event id"
);
assert(
  resolvePayrollLinkedEventId("2026-06", {}, [payrollEvent]) === null,
  "unmatched period should not infer a linked payroll event id"
);

const summary = buildPayrollArtifactSummary({
  taxItems: [
    {
      id: "tax-1",
      companyId: "company-1",
      businessEventId: "evt-payroll-1",
      mappingId: "map-1",
      taxType: "个人所得税",
      treatment: "申报代扣代缴个税",
      basis: "工资薪金",
      filingPeriod: "2026-05",
      status: "ready",
      source: "analysis",
      createdAt: "",
      updatedAt: ""
    }
  ] as TaxItem[],
  vouchers: [
    {
      id: "vou-1",
      companyId: "company-1",
      businessEventId: "evt-payroll-1",
      mappingId: "map-1",
      voucherType: "accrual",
      summary: "计提工资",
      status: "review_required",
      lines: [],
      approvedAt: null,
      postedAt: null,
      source: "analysis",
      createdAt: "",
      updatedAt: ""
    }
  ] as Voucher[],
  risks: [
    {
      id: "risk-1",
      companyId: "company-1",
      businessEventId: "evt-payroll-1",
      ruleCode: "PAYROLL_IIT_MISSING",
      severity: "high",
      priority: "P1",
      status: "open",
      title: "缺少个税处理",
      detail: "工资已确认但未形成个税复核闭环",
      createdAt: "",
      updatedAt: ""
    }
  ] as RiskFinding[]
});

assert(summary.taxHighlights[0] === "个人所得税｜ready", "tax summary should expose tax type and status");
assert(summary.voucherHighlights[0] === "accrual｜review_required｜计提工资", "voucher summary should expose voucher status and summary");
assert(summary.riskHighlights[0] === "P1｜缺少个税处理", "risk summary should expose payroll risk priority and title");
assert(summary.pendingActions.includes("处理 1 条工资风险"), "open risks should produce a pending action");

console.log("payroll-closure-ok");
