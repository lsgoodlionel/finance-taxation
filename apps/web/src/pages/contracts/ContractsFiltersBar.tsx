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
    <div style={{ display: "flex", gap: "12px" }}>
      <select
        value={filterType}
        onChange={(event) => onTypeChange(event.target.value)}
        style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px" }}
      >
        <option value="">全部类型</option>
        {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select
        value={filterStatus}
        onChange={(event) => onStatusChange(event.target.value)}
        style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px" }}
      >
        <option value="">全部状态</option>
        {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button
        onClick={onApply}
        style={{ padding: "8px 16px", borderRadius: "8px", background: "#eef0f3", border: "none", cursor: "pointer", fontSize: "13px" }}
      >
        筛选
      </button>
    </div>
  );
}
