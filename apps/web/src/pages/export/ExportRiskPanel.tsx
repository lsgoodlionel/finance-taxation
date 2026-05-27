import React from "react";
import type { RiskFinding } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportRiskPanelProps = {
  findings: RiskFinding[];
  onOpenFinding: (finding: RiskFinding) => void;
  renderActionButton: (onClick: () => void, label?: string) => React.ReactNode;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportRiskPanel({ findings, onOpenFinding, renderActionButton, cellStyle }: ExportRiskPanelProps) {
  return (
    <DataTableShell title="风险复盘导出">
      {findings.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无风险发现</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["规则", "优先级", "事项", "标题", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id}>
                <td style={cellStyle()}>{finding.ruleCode}</td>
                <td style={cellStyle()}>{finding.priority || "—"}</td>
                <td style={cellStyle()}>{finding.businessEventId || "—"}</td>
                <td style={cellStyle()}>{finding.title}</td>
                <td style={cellStyle()}>
                  {renderActionButton(() => onOpenFinding(finding), "打开复盘记录")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
