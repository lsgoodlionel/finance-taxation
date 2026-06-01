const RESOURCE_TYPE_LABELS: Record<string, string> = {
  business_event: "经营事项",
  voucher: "凭证",
  document: "单据",
  contract: "合同",
  employee: "员工",
  payroll: "工资",
  tax_item: "税务事项",
  risk_finding: "风险发现"
};

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

type AuditFiltersBarProps = {
  resourceTypes: string[];
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
  resourceTypes,
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
  return (
    <div style={{ ...panelStyle(), display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
        操作对象
        <select value={resourceType} onChange={(e) => onResourceTypeChange(e.target.value)} style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }}>
          {resourceTypes.map((rt) => (
            <option key={rt} value={rt}>{rt ? (RESOURCE_TYPE_LABELS[rt] ?? rt) : "全部类型"}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
        资源编号
        <input value={resourceId} onChange={(e) => onResourceIdChange(e.target.value)} placeholder="例如 contract-xxx / voucher-xxx" style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", minWidth: "240px" }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
        开始日期
        <input type="date" value={fromDate} onChange={(e) => onFromDateChange(e.target.value)} style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
        结束日期
        <input type="date" value={toDate} onChange={(e) => onToDateChange(e.target.value)} style={{ fontSize: "13px", padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }} />
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
  );
}
