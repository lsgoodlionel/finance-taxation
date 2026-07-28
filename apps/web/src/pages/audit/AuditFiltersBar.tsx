import React from "react";
import { buildResourceTypeOptions, describeUnauditedResourceType } from "./audit-resource-types";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "13px"
};

const controlStyle: React.CSSProperties = {
  fontSize: "13px",
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid rgba(20,40,60,0.15)"
};

const noticeStyle: React.CSSProperties = {
  marginTop: "12px",
  padding: "10px 14px",
  borderRadius: "12px",
  background: "rgba(245,158,11,0.10)",
  color: "#92400e",
  fontSize: "12.5px",
  lineHeight: 1.7
};

type AuditFiltersBarProps = {
  resourceType: string;
  resourceId: string;
  fromDate: string;
  toDate: string;
  onResourceTypeChange: (value: string) => void;
  onResourceIdChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function AuditFiltersBar({
  resourceType,
  resourceId,
  fromDate,
  toDate,
  onResourceTypeChange,
  onResourceIdChange,
  onFromDateChange,
  onToDateChange,
  onSearch,
  onReset
}: AuditFiltersBarProps) {
  const options = buildResourceTypeOptions(resourceType);
  // 选了一个后端根本不写审计日志的类型时，空列表会被读成「这个对象没人动过」。
  // 直接说明白为什么查不到，以及该去哪儿查。
  const unauditedNotice = describeUnauditedResourceType(resourceType);

  return (
    <div>
      <div style={{ ...panelStyle(), display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={labelStyle}>
          操作对象
          <select value={resourceType} onChange={(event) => onResourceTypeChange(event.target.value)} style={controlStyle}>
            {options.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          资源编号
          <input
            value={resourceId}
            onChange={(event) => onResourceIdChange(event.target.value)}
            placeholder="例如 contract-xxx / voucher-xxx"
            style={{ ...controlStyle, minWidth: "240px" }}
          />
        </label>
        <label style={labelStyle}>
          开始日期
          <input type="date" value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} style={controlStyle} />
        </label>
        <label style={labelStyle}>
          结束日期
          <input type="date" value={toDate} onChange={(event) => onToDateChange(event.target.value)} style={controlStyle} />
        </label>
        <button onClick={onSearch} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#1e2a37", color: "#fff", fontSize: "13px", cursor: "pointer" }}>
          查询
        </button>
        {(resourceType || resourceId || fromDate || toDate) ? (
          <button onClick={onReset} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", background: "none", color: "#6c7a89", fontSize: "13px", cursor: "pointer" }}>
            清除过滤
          </button>
        ) : null}
      </div>
      {unauditedNotice ? (
        <div style={noticeStyle} role="status">{unauditedNotice}</div>
      ) : null}
    </div>
  );
}
