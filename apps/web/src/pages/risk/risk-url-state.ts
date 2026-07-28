import type { RiskScopeFilter } from "../risk-scope";

export type RiskViewFilter = "open" | "closed" | "all";

export type RiskUrlState = {
  scope: RiskScopeFilter;
  eventId: string;
  findingId: string;
  view: RiskViewFilter;
  /** 当前正在做的那件事（见 risk-tasks.ts）；空串表示由页面取默认值。 */
  task: string;
};

export function readRiskUrlState(searchParams: URLSearchParams): RiskUrlState {
  const scopeParam = searchParams.get("scope");
  const viewParam = searchParams.get("view");
  return {
    scope: scopeParam === "contract" || scopeParam === "payroll" ? scopeParam : "all",
    eventId: searchParams.get("event") ?? "",
    findingId: searchParams.get("finding") ?? "",
    view: viewParam === "open" || viewParam === "closed" ? viewParam : "all",
    task: searchParams.get("task") ?? ""
  };
}

export function writeRiskUrlState(state: RiskUrlState) {
  const next = new URLSearchParams();
  if (state.scope !== "all") {
    next.set("scope", state.scope);
  }
  if (state.eventId) {
    next.set("event", state.eventId);
  }
  if (state.findingId) {
    next.set("finding", state.findingId);
  }
  if (state.view !== "all") {
    next.set("view", state.view);
  }
  if (state.task) {
    next.set("task", state.task);
  }
  return next;
}
