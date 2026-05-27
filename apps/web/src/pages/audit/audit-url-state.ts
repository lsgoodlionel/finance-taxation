export type AuditUrlState = {
  resourceType: string;
  resourceId: string;
  from: string;
  to: string;
  offset: number;
  logId: string;
  expandedId: string;
};

export function readAuditUrlState(searchParams: URLSearchParams): AuditUrlState {
  return {
    resourceType: searchParams.get("resourceType") ?? "",
    resourceId: searchParams.get("resourceId") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    offset: Number(searchParams.get("offset") ?? "0") || 0,
    logId: searchParams.get("log") ?? "",
    expandedId: searchParams.get("expanded") ?? ""
  };
}

export function writeAuditUrlState(state: AuditUrlState) {
  const next = new URLSearchParams();
  if (state.resourceType) next.set("resourceType", state.resourceType);
  if (state.resourceId) next.set("resourceId", state.resourceId);
  if (state.from) next.set("from", state.from);
  if (state.to) next.set("to", state.to);
  if (state.offset > 0) next.set("offset", String(state.offset));
  if (state.logId) next.set("log", state.logId);
  if (state.expandedId) next.set("expanded", state.expandedId);
  return next;
}
