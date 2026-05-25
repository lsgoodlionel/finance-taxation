import type { BusinessEventStatus, ContractStatus } from "@finance-taxation/domain-model";

export function getContractCloseEventStatus(status: Extract<ContractStatus, "fulfilled" | "terminated">): BusinessEventStatus {
  return status === "fulfilled" ? "archived" : "blocked";
}
