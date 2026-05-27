import React from "react";
import type { ReportSnapshot } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportReportsPanelProps = {
  snapshots: ReportSnapshot[];
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onBatchOpen: () => void;
  onOpenSnapshot: (id: string) => void;
  buildFileName: (snapshot: ReportSnapshot) => string;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
  batchButtonStyle: React.CSSProperties;
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

export function ExportReportsPanel({
  snapshots,
  selectedIds,
  onToggleSelection,
  onBatchOpen,
  onOpenSnapshot,
  buildFileName,
  cellStyle,
  batchButtonStyle
}: ExportReportsPanelProps) {
  return (
    <DataTableShell
      title="财务报表快照导出"
      actions={(
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedIds.length} 项</span>
          <button disabled={selectedIds.length === 0} onClick={onBatchOpen} style={{ ...batchButtonStyle, opacity: selectedIds.length ? 1 : 0.5 }}>
            批量打开
          </button>
        </div>
      )}
    >
      {snapshots.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无报表快照，请先在「财务报表」页生成快照</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["选择", "报表类型", "期间", "快照日期", "建议文件名", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr key={snapshot.id}>
                <td style={cellStyle()}>
                  <input type="checkbox" checked={selectedIds.includes(snapshot.id)} onChange={() => onToggleSelection(snapshot.id)} />
                </td>
                <td style={cellStyle()}>{REPORT_TYPE_LABELS[snapshot.reportType] ?? snapshot.reportType}</td>
                <td style={cellStyle()}>{snapshot.periodLabel}</td>
                <td style={cellStyle()}>{snapshot.snapshotDate}</td>
                <td style={cellStyle()}>{buildFileName(snapshot)}</td>
                <td style={cellStyle()}>
                  <button onClick={() => onOpenSnapshot(snapshot.id)} style={{ ...batchButtonStyle, opacity: 1 }}>
                    导出 PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
