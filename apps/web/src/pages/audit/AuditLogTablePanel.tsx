import type { AuditLog } from "@finance-taxation/domain-model";
import { resolveAuditLogTarget } from "../drilldown";

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

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  update_status: "状态变更",
  delete: "删除",
  approve: "审核",
  post: "过账",
  archive: "归档",
  close: "关闭",
  compute: "计算工资",
  confirm: "确认工资",
  analyze: "AI 分析"
};

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

const cell: React.CSSProperties = {
  borderBottom: "1px solid rgba(20,40,60,0.08)",
  padding: "10px 8px",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: "13px"
};

type AuditLogTablePanelProps = {
  logs: AuditLog[];
  loading: boolean;
  navResourceId: string;
  expandedId: string | null;
  selectedLogId: string;
  total: number;
  limit: number;
  offset: number;
  renderChanges: (changes: Record<string, unknown> | null) => React.ReactNode;
  onToggleExpanded: (logId: string) => void;
  onSelectLog: (logId: string) => void;
  onNavigate: (path: string, state?: Record<string, string>) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function AuditLogTablePanel({
  logs,
  loading,
  navResourceId,
  expandedId,
  selectedLogId,
  total,
  limit,
  offset,
  renderChanges,
  onToggleExpanded,
  onSelectLog,
  onNavigate,
  onPrevPage,
  onNextPage
}: AuditLogTablePanelProps) {
  function fmtDate(iso: string) {
    return iso ? new Date(iso).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-";
  }

  function actionTag(action: string) {
    const colorMap: Record<string, string> = {
      create: "#1a7f5a",
      approve: "#1a7f5a",
      confirm: "#1a7f5a",
      post: "#2563eb",
      compute: "#2563eb",
      analyze: "#7c3aed",
      update: "#d97706",
      update_status: "#d97706",
      close: "#dc2626",
      archive: "#6c7a89",
      delete: "#dc2626"
    };
    return (
      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", background: `${colorMap[action] ?? "#6c7a89"}18`, color: colorMap[action] ?? "#6c7a89", fontWeight: 500, whiteSpace: "nowrap" }}>
        {ACTION_LABELS[action] ?? action}
      </span>
    );
  }

  return (
    <div style={panelStyle()}>
      {loading ? (
        <div style={{ textAlign: "center", color: "#aab5c0", padding: "40px" }}>加载中...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#aab5c0", padding: "40px" }}>暂无审计记录</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#6c7a89", fontSize: "12px", letterSpacing: "0.04em" }}>
              {["时间", "操作人", "操作类型", "对象类型", "对象标签", "变更详情", "跳转"].map((h) => (
                <th key={h} style={{ ...cell, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;
              const hasChanges = !!log.changes;
              const target = resolveAuditLogTarget(log);
              const isSelected = selectedLogId === log.id;
              return (
                <tr key={log.id} style={{ background: isSelected ? "rgba(37,99,235,0.06)" : "transparent" }}>
                  <td style={{ ...cell, whiteSpace: "nowrap", color: "#6c7a89" }}>{fmtDate(log.createdAt)}</td>
                  <td style={cell}>{log.userName ?? log.userId ?? "-"}</td>
                  <td style={cell}>{actionTag(log.action)}</td>
                  <td style={cell}>{RESOURCE_TYPE_LABELS[log.resourceType] ?? log.resourceType}</td>
                  <td style={{ ...cell, background: navResourceId === log.resourceId ? "rgba(37,99,235,0.06)" : "transparent" }}>
                    <div style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.resourceLabel ?? log.resourceId ?? "-"}
                    </div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {hasChanges ? (
                        <button onClick={() => onToggleExpanded(log.id)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: "pointer" }}>
                          {isExpanded ? "收起" : "查看变更"}
                        </button>
                      ) : (
                        <span style={{ color: "#aab5c0" }}>-</span>
                      )}
                      <button onClick={() => onSelectLog(log.id)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: "pointer" }}>
                        {isSelected ? "当前详情" : "查看详情"}
                      </button>
                    </div>
                    {isExpanded ? (
                      <div style={{ marginTop: "6px", padding: "8px", background: "rgba(20,40,60,0.04)", borderRadius: "6px", maxWidth: "300px" }}>
                        {renderChanges(log.changes)}
                      </div>
                    ) : null}
                  </td>
                  <td style={cell}>
                    {target ? (
                      <button onClick={() => onNavigate(target.path, target.state)} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "4px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: "pointer" }}>
                        {target.label}
                      </button>
                    ) : (
                      <span style={{ color: "#aab5c0" }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {total > limit ? (
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "center", alignItems: "center", fontSize: "13px" }}>
          <button disabled={offset === 0} onClick={onPrevPage} style={{ padding: "6px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: offset === 0 ? "default" : "pointer", color: offset === 0 ? "#aab5c0" : "#1e2a37" }}>
            上一页
          </button>
          <span style={{ color: "#6c7a89" }}>{offset + 1} – {Math.min(offset + limit, total)} / {total}</span>
          <button disabled={offset + limit >= total} onClick={onNextPage} style={{ padding: "6px 16px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", background: "none", cursor: offset + limit >= total ? "default" : "pointer", color: offset + limit >= total ? "#aab5c0" : "#1e2a37" }}>
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
