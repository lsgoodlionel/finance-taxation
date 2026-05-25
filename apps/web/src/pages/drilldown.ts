import type { AuditLog, BusinessEvent } from "@finance-taxation/domain-model";

export interface DrilldownTarget {
  path: string;
  state?: Record<string, string>;
  label: string;
}

export interface DrilldownState {
  businessEventId?: string;
  contractId?: string;
  documentId?: string;
  voucherId?: string;
  taxItemId?: string;
  riskFindingId?: string;
  employeeId?: string;
  payrollPeriod?: string;
  tab?: string;
  resourceType?: string;
  resourceId?: string;
}

export function derivePayrollPeriodFromEvent(event: Pick<BusinessEvent, "type" | "occurredOn">): string | null {
  if (event.type !== "payroll") {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(event.occurredOn) ? event.occurredOn.slice(0, 7) : null;
}

export function buildRiskDrilldownTargets(event: BusinessEvent | null): DrilldownTarget[] {
  if (!event) {
    return [];
  }

  const targets: DrilldownTarget[] = [
    { path: "/events", state: { businessEventId: event.id }, label: "事项总线" },
    { path: "/tasks", state: { businessEventId: event.id }, label: "任务中心" },
    { path: "/documents", state: { businessEventId: event.id }, label: "单据中心" },
    { path: "/tax", state: { businessEventId: event.id }, label: "税务中心" },
    { path: "/vouchers", state: { businessEventId: event.id }, label: "凭证中心" },
    { path: "/audit", state: { resourceType: "business_event", resourceId: event.id }, label: "审计日志" }
  ];

  if (event.contractId) {
    targets.unshift({ path: "/contracts", state: { contractId: event.contractId }, label: "合同管理" });
  }

  const payrollPeriod = derivePayrollPeriodFromEvent(event);
  if (payrollPeriod) {
    targets.unshift({ path: "/payroll", state: { payrollPeriod }, label: "工资管理" });
  }

  return targets;
}

export function buildRiskClosureTargetChain({
  findingId,
  event
}: {
  findingId: string;
  event: BusinessEvent | null;
}): DrilldownTarget[] {
  const targets = buildRiskDrilldownTargets(event);
  return [
    ...targets,
    {
      path: "/audit",
      state: { resourceType: "risk_finding", resourceId: findingId, riskFindingId: findingId },
      label: "审计日志"
    }
  ];
}

export function normalizeDrilldownState(state: unknown): DrilldownState {
  if (!state || typeof state !== "object") {
    return {};
  }
  const source = state as Record<string, unknown>;
  const pick = (key: string) => typeof source[key] === "string" ? source[key] : undefined;
  return {
    businessEventId: pick("businessEventId"),
    contractId: pick("contractId"),
    documentId: pick("documentId"),
    voucherId: pick("voucherId"),
    taxItemId: pick("taxItemId"),
    riskFindingId: pick("riskFindingId"),
    employeeId: pick("employeeId"),
    payrollPeriod: pick("payrollPeriod"),
    tab: pick("tab"),
    resourceType: pick("resourceType"),
    resourceId: pick("resourceId")
  };
}

export function resolveAuditContextFromState(state: DrilldownState) {
  if (state.resourceType && state.resourceId) {
    return { resourceType: state.resourceType, resourceId: state.resourceId };
  }
  if (state.taxItemId) {
    return { resourceType: "tax_item", resourceId: state.taxItemId } as const;
  }
  if (state.documentId) {
    return { resourceType: "document", resourceId: state.documentId } as const;
  }
  if (state.voucherId) {
    return { resourceType: "voucher", resourceId: state.voucherId } as const;
  }
  if (state.contractId) {
    return { resourceType: "contract", resourceId: state.contractId } as const;
  }
  if (state.businessEventId) {
    return { resourceType: "business_event", resourceId: state.businessEventId } as const;
  }
  if (state.riskFindingId) {
    return { resourceType: "risk_finding", resourceId: state.riskFindingId } as const;
  }
  return null;
}

export function resolveAuditLogTarget(log: AuditLog): DrilldownTarget | null {
  if (!log.resourceId) {
    return null;
  }

  switch (log.resourceType) {
    case "business_event":
      return { path: "/events", state: { businessEventId: log.resourceId }, label: "查看事项" };
    case "voucher":
      return { path: "/vouchers", state: { voucherId: log.resourceId }, label: "查看凭证" };
    case "document":
      return { path: "/documents", state: { documentId: log.resourceId }, label: "查看单据" };
    case "contract":
      return { path: "/contracts", state: { contractId: log.resourceId }, label: "查看合同" };
    case "employee":
      return { path: "/payroll", state: { employeeId: log.resourceId, tab: "employees" }, label: "查看员工" };
    case "tax_item":
      return { path: "/tax", state: { taxItemId: log.resourceId }, label: "查看税务事项" };
    case "risk_finding":
      return { path: "/risk", state: { riskFindingId: log.resourceId }, label: "查看风险发现" };
    case "payroll": {
      const period = extractPayrollPeriod(log);
      return period ? { path: "/payroll", state: { payrollPeriod: period }, label: "查看工资期间" } : null;
    }
    default:
      return null;
  }
}

function extractPayrollPeriod(log: AuditLog): string | null {
  const periodFromChanges = (() => {
    const changes = log.changes as Record<string, unknown> | null;
    if (!changes) return null;

    if ("data" in changes && changes.data && typeof changes.data === "object") {
      const period = (changes.data as Record<string, unknown>).period;
      return typeof period === "string" ? period : null;
    }

    const direct = changes.period;
    return typeof direct === "string" ? direct : null;
  })();

  if (periodFromChanges && /^\d{4}-\d{2}$/.test(periodFromChanges)) {
    return periodFromChanges;
  }

  const candidates = [log.resourceLabel, log.resourceId].filter((value): value is string => Boolean(value));
  for (const value of candidates) {
    const match = value.match(/\b\d{4}-\d{2}\b/);
    if (match) {
      return match[0];
    }
  }

  return null;
}
