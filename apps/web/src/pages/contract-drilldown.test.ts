import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import {
  filterContractRiskFindings,
  resolveContractAuditContext
} from "./contract-drilldown";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const events: BusinessEvent[] = [
  {
    id: "evt-1",
    companyId: "cmp-1",
    type: "sales",
    title: "合同A 开票申请事项",
    description: "",
    department: "财务部",
    ownerId: null,
    occurredOn: "2026-05-01",
    amount: "100.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    contractId: "contract-a"
  },
  {
    id: "evt-2",
    companyId: "cmp-1",
    type: "sales",
    title: "合同B 开票申请事项",
    description: "",
    department: "财务部",
    ownerId: null,
    occurredOn: "2026-05-01",
    amount: "100.00",
    currency: "CNY",
    status: "analyzed",
    source: "manual",
    contractId: "contract-b"
  }
];

const findings: RiskFinding[] = [
  {
    id: "risk-1",
    companyId: "cmp-1",
    businessEventId: "evt-1",
    ruleCode: "contract-missing-tax",
    title: "合同A 风险",
    detail: "",
    severity: "high",
    priority: "P1",
    status: "open",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "risk-2",
    companyId: "cmp-1",
    businessEventId: "evt-2",
    ruleCode: "contract-missing-tax",
    title: "合同B 风险",
    detail: "",
    severity: "medium",
    priority: "P2",
    status: "open",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  }
];

const contractARisks = filterContractRiskFindings(findings, events, "contract-a");
expectEqual(contractARisks.length, 1, "contract-scoped risk list should only include matching event chain");
expectEqual(contractARisks[0]?.id, "risk-1", "contract-scoped risk should keep matching finding");

const auditContext = resolveContractAuditContext("contract-a");
expectEqual(auditContext.resourceType, "contract", "contract audit context should target contract resource type");
expectEqual(auditContext.resourceId, "contract-a", "contract audit context should target exact contract id");

console.log("contract-drilldown-ok");
