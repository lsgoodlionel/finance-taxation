import React from "react";
import type { AuditLog } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportAuditPanelProps = {
  logs: AuditLog[];
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  reuse: "复用",
  update_status: "状态变更",
  retry: "重试"
};

function renderChangeSummary(changes: Record<string, unknown> | null) {
  if (!changes) {
    return "—";
  }

  if (typeof changes.retryCount === "number") {
    return `重试次数：${changes.retryCount}`;
  }

  if (typeof changes.lastError === "string" && changes.lastError) {
    return `失败原因：${changes.lastError}`;
  }

  if (typeof changes.status === "string") {
    return `状态：${changes.status}`;
  }

  return Object.entries(changes)
    .slice(0, 2)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("；");
}

export function ExportAuditPanel({ logs, cellStyle }: ExportAuditPanelProps) {
  return (
    <DataTableShell title="导出审计轨迹">
      {logs.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "24px" }}>暂无导出审计记录</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["时间", "动作", "对象", "变更", "操作人"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td style={cellStyle()}>{ACTION_LABELS[item.action] ?? item.action}</td>
                <td style={cellStyle()}>{item.resourceLabel || item.resourceId || "—"}</td>
                <td style={cellStyle()}>{renderChangeSummary((item.changes as Record<string, unknown> | null) ?? null)}</td>
                <td style={cellStyle()}>{item.userName || "系统"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
