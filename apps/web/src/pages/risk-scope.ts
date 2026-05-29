import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import type { RiskViewFilter } from "./risk/risk-url-state";

export type RiskScopeFilter = "all" | "contract" | "payroll";

export function filterContractRiskFindings(
  findings: RiskFinding[],
  events: BusinessEvent[],
  contractId: string
) {
  const eventMap = new Map(events.map((event) => [event.id, event]));
  return findings.filter((finding) => {
    const event = finding.businessEventId ? eventMap.get(finding.businessEventId) ?? null : null;
    return event?.contractId === contractId;
  });
}

export function filterRiskFindingsByScope(
  findings: RiskFinding[],
  eventMap: Map<string, BusinessEvent>,
  scope: RiskScopeFilter
) {
  if (scope === "all") {
    return findings;
  }

  return findings.filter((finding) => {
    const event = finding.businessEventId ? eventMap.get(finding.businessEventId) ?? null : null;
    if (!event) {
      return false;
    }
    if (scope === "contract") {
      return Boolean(event.contractId);
    }
    return event.type === "payroll";
  });
}

export function filterRiskFindingsByView(findings: RiskFinding[], view: RiskViewFilter) {
  if (view === "all") {
    return findings;
  }

  return findings.filter((finding) => {
    const isClosed = finding.status !== "open";
    return view === "closed" ? isClosed : !isClosed;
  });
}

export function resolveInitialAuditExpansion(
  logs: Array<{ id: string; resourceId: string | null }>,
  resourceId?: string | null
) {
  if (!resourceId) {
    return null;
  }
  return logs.find((item) => item.resourceId === resourceId)?.id ?? null;
}
