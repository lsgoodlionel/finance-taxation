import type { AuditLog, BusinessEvent } from "@finance-taxation/domain-model";
import { buildRiskDrilldownTargets, derivePayrollPeriodFromEvent, resolveAuditLogTarget } from "./drilldown";

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

console.log("drilldown-ok");
