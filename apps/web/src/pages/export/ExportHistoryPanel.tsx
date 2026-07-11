import React from "react";
import type { ExportJob } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportHistoryPanelProps = {
  jobs: ExportJob[];
  highlightedJobId?: string | null;
  onUpdateStatus: (jobId: string, status: ExportJob["status"]) => void;
  renderActionButton: (onClick: () => void, label: string) => React.ReactNode;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportHistoryPanel({ jobs, highlightedJobId = null, onUpdateStatus, renderActionButton, cellStyle }: ExportHistoryPanelProps) {
  return (
    <DataTableShell title="最近导出记录">
      {jobs.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "24px" }}>暂无导出记录</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["时间", "类型", "名称", "建议文件名", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((item) => (
              <tr key={item.id} style={{ background: item.id === highlightedJobId ? "rgba(37,99,235,0.08)" : "transparent" }}>
                <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td style={cellStyle()}>{item.kind}</td>
                <td style={cellStyle()}>{item.label}</td>
                <td style={cellStyle()}>
                  <div>{item.fileName}</div>
                  <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "2px" }}>状态：{item.status}</div>
                  <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "2px" }}>重试：{item.retryCount} 次</div>
                  {item.lastError ? (
                    <div style={{ fontSize: "11px", color: "#b45309", marginTop: "2px" }}>失败原因：{item.lastError}</div>
                  ) : null}
                  {item.nextRetryAt ? (
                    <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "2px" }}>
                      下次重试：{new Date(item.nextRetryAt).toLocaleString("zh-CN")}
                    </div>
                  ) : null}
                  {item.id === highlightedJobId ? (
                    <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "2px" }}>当前审计回跳定位任务</div>
                  ) : null}
                </td>
                <td style={cellStyle()}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {(item.status === "created" || item.status === "opened") ? renderActionButton(() => onUpdateStatus(item.id, "completed"), "标记完成") : null}
                    {(item.status === "created" || item.status === "opened") ? renderActionButton(() => onUpdateStatus(item.id, "failed"), "标记失败") : null}
                    {(item.status === "failed" || item.status === "completed") ? renderActionButton(() => onUpdateStatus(item.id, "opened"), "重试") : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
