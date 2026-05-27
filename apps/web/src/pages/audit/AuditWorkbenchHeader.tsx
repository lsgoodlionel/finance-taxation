import type { DrilldownState } from "../drilldown";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type AuditWorkbenchHeaderProps = {
  total: number;
  message: string;
  navState: DrilldownState;
};

export function AuditWorkbenchHeader({ total, message, navState }: AuditWorkbenchHeaderProps) {
  const context = navState.resourceId ?? navState.riskFindingId ?? navState.businessEventId ?? navState.contractId ?? "全局审计检索";

  return (
    <article style={panelStyle()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>审计日志</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", minWidth: "320px" }}>
          <div style={{ padding: "12px 14px", borderRadius: "16px", background: "rgba(37,99,235,0.08)" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前上下文</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{context}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "16px", background: "rgba(16,185,129,0.08)" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>命中记录</div>
            <div style={{ fontWeight: 700, fontSize: "14px" }}>{total}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
