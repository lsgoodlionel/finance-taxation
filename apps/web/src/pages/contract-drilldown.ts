import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";

export function filterContractRiskFindings(
  findings: RiskFinding[],
  events: BusinessEvent[],
  contractId: string
) {
  const eventIds = new Set(
    events
      .filter((event) => event.contractId === contractId)
      .map((event) => event.id)
  );

  return findings.filter((finding) => !!finding.businessEventId && eventIds.has(finding.businessEventId));
}

export function resolveContractAuditContext(contractId: string) {
  return {
    resourceType: "contract",
    resourceId: contractId
  } as const;
}

export function buildContractNavigationState(
  contractId: string,
  extra?: Record<string, unknown>
): Record<string, unknown> & { contractId: string } {
  return {
    contractId,
    ...extra
  };
}
