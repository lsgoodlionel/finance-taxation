/**
 * 风险发现列表的工具条：筛选 + 生成新发现。
 *
 * 这些控件改造前全挤在页头里。筛选（风险对象 / 风险状态）决定列表看什么，就该
 * 贴着列表；「执行风险检查」是针对某条经营事项跑一次扫描、往列表里补新发现的
 * 动作，所以事项选择器和这个按钮成对放在一起，用户一眼看得出「选谁 → 查谁」。
 */
import React from "react";
import type { BusinessEvent } from "@finance-taxation/domain-model";
import type { RiskScopeFilter } from "../risk-scope";
import type { RiskViewFilter } from "./risk-url-state";

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: "12px",
  color: "#6c7a89",
  display: "block",
  marginBottom: "4px"
};

const CONTROL_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(20,40,60,0.2)",
  boxSizing: "border-box",
  fontSize: "13px"
};

const DROPDOWN_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  zIndex: 100,
  background: "#fff",
  border: "1px solid rgba(20,40,60,0.15)",
  borderRadius: "8px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
  maxHeight: "220px",
  overflowY: "auto",
  marginTop: "4px"
};

export type RiskFindingsToolbarProps = {
  scopeFilter: RiskScopeFilter;
  viewFilter: RiskViewFilter;
  eventId: string;
  eventSearch: string;
  visibleEvents: BusinessEvent[];
  showEventDropdown: boolean;
  dropdownRef: React.Ref<HTMLDivElement>;
  onEventSearchChange: (value: string) => void;
  onFocusEventSearch: () => void;
  onSelectEvent: (eventId: string, title: string) => void;
  onScopeChange: (scope: RiskScopeFilter) => void;
  onViewChange: (view: RiskViewFilter) => void;
  onRunRiskCheck: () => void;
};

export function RiskFindingsToolbar({
  scopeFilter,
  viewFilter,
  eventId,
  eventSearch,
  visibleEvents,
  showEventDropdown,
  dropdownRef,
  onEventSearchChange,
  onFocusEventSearch,
  onSelectEvent,
  onScopeChange,
  onViewChange,
  onRunRiskCheck
}: RiskFindingsToolbarProps) {
  const query = eventSearch.trim().toLowerCase();
  const matchedEvents = visibleEvents.filter(
    (event) => !query || event.title.toLowerCase().includes(query) || event.id.toLowerCase().includes(query)
  );

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
      <div style={{ minWidth: "130px" }}>
        <label style={FIELD_LABEL_STYLE} htmlFor="risk-scope-filter">
          风险对象
        </label>
        <select
          id="risk-scope-filter"
          value={scopeFilter}
          onChange={(event) => onScopeChange(event.target.value as RiskScopeFilter)}
          style={CONTROL_STYLE}
        >
          <option value="all">全部</option>
          <option value="contract">合同链</option>
          <option value="payroll">工资链</option>
        </select>
      </div>

      <div style={{ minWidth: "130px" }}>
        <label style={FIELD_LABEL_STYLE} htmlFor="risk-view-filter">
          风险状态
        </label>
        <select
          id="risk-view-filter"
          value={viewFilter}
          onChange={(event) => onViewChange(event.target.value as RiskViewFilter)}
          style={CONTROL_STYLE}
        >
          <option value="all">全部</option>
          <option value="open">待关闭</option>
          <option value="closed">已关闭</option>
        </select>
      </div>

      <div ref={dropdownRef} style={{ position: "relative", flex: 2, minWidth: "200px" }}>
        <label style={FIELD_LABEL_STYLE} htmlFor="risk-event-search">
          对哪条经营事项再查一遍
        </label>
        <input
          id="risk-event-search"
          value={eventSearch}
          onChange={(event) => onEventSearchChange(event.target.value)}
          onFocus={onFocusEventSearch}
          placeholder="点击选择或搜索事项…"
          style={CONTROL_STYLE}
        />
        {showEventDropdown ? (
          <div style={DROPDOWN_STYLE}>
            {matchedEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event.id, event.title)}
                style={{
                  padding: "9px 14px",
                  cursor: "pointer",
                  fontSize: "13px",
                  borderBottom: "1px solid rgba(20,40,60,0.05)",
                  background: event.id === eventId ? "rgba(79,142,247,0.07)" : "transparent",
                  color: event.id === eventId ? "#2563eb" : "#1e2a37"
                }}
              >
                <div style={{ fontWeight: 500 }}>{event.title}</div>
                <div style={{ fontSize: "11px", color: "#9aa5b4", marginTop: "2px" }}>{event.id}</div>
              </div>
            ))}
            {matchedEvents.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: "13px", color: "#9aa5b4" }}>无匹配事项</div>
            ) : null}
          </div>
        ) : null}
        {eventId ? (
          <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "4px" }}>
            已选：
            <code style={{ background: "#f0f4ff", padding: "1px 5px", borderRadius: "4px" }}>{eventId}</code>
          </div>
        ) : null}
      </div>

      <button
        onClick={onRunRiskCheck}
        disabled={!eventId}
        style={{
          padding: "8px 18px",
          borderRadius: "8px",
          cursor: eventId ? "pointer" : "default",
          fontSize: "13px",
          opacity: eventId ? 1 : 0.5
        }}
      >
        执行风险检查
      </button>
    </div>
  );
}
