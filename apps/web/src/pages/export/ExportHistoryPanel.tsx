import React from "react";
import type { ExportJob } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportHistoryPanelProps = {
  jobs: ExportJob[];
  onUpdateStatus: (jobId: string, status: ExportJob["status"]) => void;
  renderActionButton: (onClick: () => void, label: string) => React.ReactNode;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportHistoryPanel({ jobs, onUpdateStatus, renderActionButton, cellStyle }: ExportHistoryPanelProps) {
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
              <tr key={item.id}>
                <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td style={cellStyle()}>{item.kind}</td>
                <td style={cellStyle()}>{item.label}</td>
                <td style={cellStyle()}>
                  <div>{item.fileName}</div>
                  <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "2px" }}>状态：{item.status}</div>
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
