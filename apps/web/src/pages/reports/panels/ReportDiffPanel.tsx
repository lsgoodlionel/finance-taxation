import React from "react";
import type { ReportDiffResult } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";

type ReportDiffPanelProps = {
  diff: ReportDiffResult | null;
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const
  };
}

export function ReportDiffPanel({ diff }: ReportDiffPanelProps) {
  if (!diff) {
    return (
      <EmptyState
        title="尚未生成差异分析"
        description="先在左侧选择基准快照和对比快照，再点击“生成差异分析”。"
      />
    );
  }

  return (
    <DataTableShell title="报表差异分析" actions={<span style={{ fontSize: "12px", color: "#6c7a89" }}>对比类型：{diff.reportType}</span>}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellStyle()}>项目</th>
            <th style={cellStyle()}>期初</th>
            <th style={cellStyle()}>期末</th>
            <th style={cellStyle()}>差异</th>
          </tr>
        </thead>
        <tbody>
          {diff.lines.map((line) => (
            <tr key={line.code}>
              <td style={cellStyle()}>{line.label}</td>
              <td style={cellStyle()}>{line.fromAmount}</td>
              <td style={cellStyle()}>{line.toAmount}</td>
              <td style={cellStyle()}>{line.delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableShell>
  );
}
