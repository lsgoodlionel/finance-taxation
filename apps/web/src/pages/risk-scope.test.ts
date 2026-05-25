import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import { filterRiskFindingsByScope, resolveInitialAuditExpansion } from "./risk-scope";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const events = new Map<string, BusinessEvent>([
  ["evt-contract", {
    id: "evt-contract",
    companyId: "cmp-1",
    type: "sales",
    title: "销售事项",
    description: "",
    department: "销售部",
    ownerId: null,
    occurredOn: "2026-05-01",
    amount: "1000.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    contractId: "contract-1"
  }],
  ["evt-payroll", {
    id: "evt-payroll",
    companyId: "cmp-1",
    type: "payroll",
    title: "工资事项",
    description: "",
    department: "人事行政部",
    ownerId: null,
    occurredOn: "2026-05-01",
    amount: "5000.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual"
  }]
]);

const findings: RiskFinding[] = [
  {
    id: "risk-contract",
    companyId: "cmp-1",
    businessEventId: "evt-contract",
    ruleCode: "sales_missing_invoice",
    severity: "high",
    status: "open",
    title: "合同缺开票",
    detail: "缺少开票事项",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  {
    id: "risk-payroll",
    companyId: "cmp-1",
    businessEventId: "evt-payroll",
    ruleCode: "payroll_missing_iit",
    severity: "medium",
    status: "open",
    title: "工资缺个税资料",
    detail: "缺少个税资料",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
];

assert(filterRiskFindingsByScope(findings, events, "contract").length === 1, "expected contract scope to keep only contract findings");
assert(filterRiskFindingsByScope(findings, events, "payroll").length === 1, "expected payroll scope to keep only payroll findings");
assert(resolveInitialAuditExpansion([{ id: "a1", resourceId: "risk-1" }, { id: "a2", resourceId: "risk-2" }], "risk-2") === "a2", "expected audit expansion to target matching resource id");

console.log("risk-scope-ok");
