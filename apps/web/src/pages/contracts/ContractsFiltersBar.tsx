import React from "react";

type ContractsFiltersBarProps = {
  filterType: string;
  filterStatus: string;
  typeOptions: Array<[string, string]>;
  statusOptions: Array<[string, string]>;
  onTypeChange(value: string): void;
  onStatusChange(value: string): void;
  onApply(): void;
};

export function ContractsFiltersBar({
  filterType,
  filterStatus,
  typeOptions,
  statusOptions,
  onTypeChange,
  onStatusChange,
  onApply
}: ContractsFiltersBarProps) {
  return (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", padding: "16px 18px", borderRadius: "16px", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(20,40,60,0.08)" }}>
      <label style={{ display: "grid", gap: "4px", fontSize: "12px", color: "#6c7a89" }}>
        <span>合同类型</span>
        <select
          value={filterType}
          onChange={(event) => onTypeChange(event.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px", minWidth: "140px" }}
        >
          <option value="">全部类型</option>
          {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: "4px", fontSize: "12px", color: "#6c7a89" }}>
        <span>合同状态</span>
        <select
          value={filterStatus}
          onChange={(event) => onStatusChange(event.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px", minWidth: "140px" }}
        >
          <option value="">全部状态</option>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button
        onClick={onApply}
        style={{ padding: "8px 16px", borderRadius: "8px", background: "#eef0f3", border: "none", cursor: "pointer", fontSize: "13px", color: "#1e2a37" }}
      >
        应用筛选
      </button>
    </div>
  );
}
