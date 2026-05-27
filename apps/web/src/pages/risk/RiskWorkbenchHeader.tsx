import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import type { DrilldownState } from "../drilldown";
import type { RiskScopeFilter } from "../risk-scope";
import type { RiskViewFilter } from "./risk-url-state";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type RiskWorkbenchHeaderProps = {
  message: string;
  navState: DrilldownState;
  scopeFilter: RiskScopeFilter;
  viewFilter: RiskViewFilter;
  eventId: string;
  eventSearch: string;
  visibleEvents: BusinessEvent[];
  selectedFinding: RiskFinding | null;
  resolution: string;
  showEventDropdown: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  onShowHelp: () => void;
  onEventSearchChange: (value: string) => void;
  onFocusEventSearch: () => void;
  onSelectEvent: (eventId: string, title: string) => void;
  onResolutionChange: (value: string) => void;
  onScopeChange: (scope: RiskScopeFilter) => void;
  onViewChange: (view: RiskViewFilter) => void;
  onRunRiskCheck: () => void;
};

export function RiskWorkbenchHeader({
  message,
  navState,
  scopeFilter,
  viewFilter,
  eventId,
  eventSearch,
  visibleEvents,
  selectedFinding,
  resolution,
  showEventDropdown,
  dropdownRef,
  onShowHelp,
  onEventSearchChange,
  onFocusEventSearch,
  onSelectEvent,
  onResolutionChange,
  onScopeChange,
  onViewChange,
  onRunRiskCheck
}: RiskWorkbenchHeaderProps) {
  const contextLabel = navState.contractId
    ? `当前合同 ${navState.contractId}`
    : navState.businessEventId
      ? `当前事项 ${navState.businessEventId}`
      : navState.riskFindingId
        ? `当前风险 ${navState.riskFindingId}`
        : "当前为全局风险工作台";

  const matchedEvents = visibleEvents.filter((ev) => {
    const q = eventSearch.toLowerCase();
    return !q || ev.title.toLowerCase().includes(q) || ev.id.toLowerCase().includes(q);
  });

  return (
    <article style={panelStyle()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <h2 style={{ margin: 0 }}>风险勾稽中心</h2>
          <div style={{ marginTop: "6px", color: "#6c7a89", fontSize: "13px" }}>{contextLabel}</div>
        </div>
        <button onClick={onShowHelp} title="操作说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
      </div>
      <p style={{ margin: "0 0 12px" }}>{message}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(79,142,247,0.08)" }}>
          <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前范围</div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{scopeFilter === "all" ? "全部对象" : scopeFilter === "contract" ? "合同链" : "工资链"}</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(37,99,235,0.08)" }}>
          <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前视图</div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{viewFilter === "all" ? "全部风险" : viewFilter === "open" ? "待关闭风险" : "已关闭风险"}</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: "16px", background: "rgba(16,185,129,0.08)" }}>
          <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前选中</div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{selectedFinding?.title ?? "未选择风险"}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div ref={dropdownRef} style={{ position: "relative", flex: 2, minWidth: "200px" }}>
          <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>选择经营事项</label>
          <input
            value={eventSearch}
            onChange={(e) => onEventSearchChange(e.target.value)}
            onFocus={onFocusEventSearch}
            placeholder="点击选择或搜索事项…"
            style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }}
          />
          {showEventDropdown && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#fff", border: "1px solid rgba(20,40,60,0.15)", borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto", marginTop: "4px" }}>
              {matchedEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvent(ev.id, ev.title)}
                  style={{ padding: "9px 14px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid rgba(20,40,60,0.05)", background: ev.id === eventId ? "rgba(79,142,247,0.07)" : "transparent", color: ev.id === eventId ? "#2563eb" : "#1e2a37" }}
                >
                  <div style={{ fontWeight: 500 }}>{ev.title}</div>
                  <div style={{ fontSize: "11px", color: "#9aa5b4", marginTop: "2px" }}>{ev.id}</div>
                </div>
              ))}
              {matchedEvents.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: "13px", color: "#9aa5b4" }}>无匹配事项</div>
              ) : null}
            </div>
          )}
          {eventId ? (
            <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "4px" }}>
              已选：<code style={{ background: "#f0f4ff", padding: "1px 5px", borderRadius: "4px" }}>{eventId}</code>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 2, minWidth: "160px" }}>
          <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>关闭说明</label>
          <input value={resolution} onChange={(event) => onResolutionChange(event.target.value)} placeholder="关闭说明" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }} />
        </div>

        <div style={{ minWidth: "140px" }}>
          <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>风险对象</label>
          <select value={scopeFilter} onChange={(event) => onScopeChange(event.target.value as RiskScopeFilter)} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }}>
            <option value="all">全部</option>
            <option value="contract">合同链</option>
            <option value="payroll">工资链</option>
          </select>
        </div>

        <div style={{ minWidth: "140px" }}>
          <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>风险状态</label>
          <select value={viewFilter} onChange={(event) => onViewChange(event.target.value as RiskViewFilter)} style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }}>
            <option value="all">全部</option>
            <option value="open">待关闭</option>
            <option value="closed">已关闭</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ fontSize: "12px", color: "transparent", marginBottom: "4px" }}>操作</div>
          <button onClick={onRunRiskCheck} disabled={!eventId} style={{ padding: "8px 18px", borderRadius: "8px", cursor: eventId ? "pointer" : "default", fontSize: "13px", opacity: eventId ? 1 : 0.5 }}>
            执行风险检查
          </button>
        </div>
      </div>
    </article>
  );
}
