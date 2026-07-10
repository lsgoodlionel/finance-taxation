import type { AuditLog, BusinessEvent } from "@finance-taxation/domain-model";
import {
  buildRiskClosureTargetChain,
  buildRiskDrilldownTargets,
  derivePayrollPeriodFromEvent,
  normalizeDrilldownState,
  resolveAuditContextFromState,
  resolveAuditLogTarget
} from "./drilldown";

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
  amount: "10000.00",
  currency: "CNY",
  status: "analyzed",
  source: "manual"
};

assert(derivePayrollPeriodFromEvent(payrollEvent) === "2026-05", "expected payroll period to derive from occurredOn");

const contractTargets = buildRiskDrilldownTargets({
  ...payrollEvent,
  id: "evt-sales-1",
  type: "sales",
  contractId: "contract-1"
});
assert(contractTargets[0]?.path === "/contracts", "expected contract target to be first when contractId exists");
assert(contractTargets.some((item) => item.path === "/tax"), "expected tax drilldown target");
assert(contractTargets.some((item) => item.path === "/documents"), "expected documents drilldown target");
assert(contractTargets.some((item) => item.path === "/audit"), "expected audit drilldown target");

const payrollTargets = buildRiskDrilldownTargets(payrollEvent);
assert(payrollTargets[0]?.path === "/payroll", "expected payroll target to be present for payroll event");

const voucherLog: AuditLog = {
  id: "audit-1",
  companyId: "company-1",
  userId: "user-1",
  userName: "Admin",
  action: "post",
  resourceType: "voucher",
  resourceId: "voucher-1",
  resourceLabel: "凭证-1",
  changes: null,
  createdAt: "2026-05-25T10:00:00Z"
};

assert(resolveAuditLogTarget(voucherLog)?.path === "/vouchers", "expected voucher logs to resolve to vouchers page");

const payrollLog: AuditLog = {
  ...voucherLog,
  id: "audit-2",
  resourceType: "payroll",
  resourceId: "payroll-2026-05",
  resourceLabel: "2026-05 工资期间",
  changes: { data: { period: "2026-05" } }
};

const payrollTarget = resolveAuditLogTarget(payrollLog);
assert(payrollTarget?.path === "/payroll", "expected payroll log to resolve to payroll page");
assert(payrollTarget?.state?.payrollPeriod === "2026-05", "expected payroll period to be extracted");

const employeeLog: AuditLog = {
  ...voucherLog,
  id: "audit-3",
  resourceType: "employee",
  resourceId: "emp-1",
  resourceLabel: "张三",
  changes: { data: { employeeId: "emp-1" } }
};

const employeeTarget = resolveAuditLogTarget(employeeLog);
assert(employeeTarget?.path === "/payroll", "expected employee log to resolve to payroll page");
assert(employeeTarget?.state?.employeeId === "emp-1", "expected employee drilldown to preserve employee id");
assert(employeeTarget?.state?.tab === "employees", "expected employee drilldown to open employee tab");
assert(employeeTarget?.state?.resourceType === "employee", "expected employee drilldown to preserve resource type");

const exportJobLog: AuditLog = {
  ...voucherLog,
  id: "audit-4",
  action: "retry",
  resourceType: "export_job",
  resourceId: "job-1",
  resourceLabel: "利润表 2026-05",
  changes: { kind: "report", retryCount: 1 }
};

const exportJobTarget = resolveAuditLogTarget(exportJobLog);
assert(exportJobTarget?.path === "/pdf-export", "expected export job log to resolve to export page");
assert(exportJobTarget?.state?.resourceType === "export_job", "expected export job drilldown to preserve resource type");
assert(exportJobTarget?.state?.scene === "reports", "expected export job drilldown to infer report scene");

const payrollTransferLog: AuditLog = {
  ...voucherLog,
  id: "audit-5",
  action: "payroll.transfer.compensated",
  resourceType: "payroll_transfer_batch",
  resourceId: "ptb-1",
  resourceLabel: "2026-05 工资代发批次",
  changes: { payrollPeriod: "2026-05", eventId: "evt-1" }
};

const payrollTransferTarget = resolveAuditLogTarget(payrollTransferLog);
assert(payrollTransferTarget?.path === "/payroll/transfer", "expected payroll transfer log to resolve to payroll transfer page");
assert(payrollTransferTarget?.state?.resourceType === "payroll_transfer_batch", "expected payroll transfer drilldown to preserve resource type");
assert(payrollTransferTarget?.state?.payrollPeriod === "2026-05", "expected payroll transfer drilldown to keep payroll period");

const normalized = normalizeDrilldownState({
  voucherId: "voucher-2",
  payrollPeriod: "2026-05",
  tab: "payroll",
  scene: "reports",
  focus: "payroll-risk",
  riskScope: "payroll"
});
assert(normalized.voucherId === "voucher-2", "expected voucher id to be normalized");
assert(normalized.payrollPeriod === "2026-05", "expected payroll period to be normalized");
assert(normalized.scene === "reports", "expected scene to be normalized");
assert(normalized.focus === "payroll-risk", "expected focus to be normalized");
assert(normalized.riskScope === "payroll", "expected risk scope to be normalized");

const taxAuditContext = resolveAuditContextFromState({ taxItemId: "tax-1" });
assert(taxAuditContext?.resourceType === "tax_item", "expected tax item context to derive resource type");
assert(taxAuditContext?.resourceId === "tax-1", "expected tax item context to derive resource id");

const riskAuditContext = resolveAuditContextFromState({
  riskFindingId: "risk-2",
  businessEventId: "evt-2",
  resourceType: "risk_finding",
  resourceId: "risk-2"
});
assert(riskAuditContext?.resourceType === "risk_finding", "expected risk finding context resource type");
assert(riskAuditContext?.resourceId === "risk-2", "expected risk finding context resource id");

const closureTargets = buildRiskClosureTargetChain({
  findingId: "risk-1",
  event: {
    ...payrollEvent,
    contractId: "contract-1"
  }
});
assert(closureTargets[0]?.path === "/contracts", "expected closure chain to include contract first");
assert(closureTargets.some((item) => item.path === "/audit"), "expected closure chain to keep audit target");
const auditTarget = closureTargets.find((item) => item.path === "/audit" && item.state?.resourceType === "risk_finding");
assert(auditTarget?.state?.contractId === "contract-1", "expected closure audit target to preserve contract context");
assert(auditTarget?.state?.riskFindingId === "risk-1", "expected closure audit target to preserve risk finding id");

console.log("drilldown-ok");
