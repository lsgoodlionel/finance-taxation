import React from "react";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportRndPanelProps = {
  projects: Array<RndProject & { summary: RndProjectSummary }>;
  onOpenProject: (project: RndProject & { summary: RndProjectSummary }) => void;
  renderActionButton: (onClick: () => void, label?: string) => React.ReactNode;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportRndPanel({ projects, onOpenProject, renderActionButton, cellStyle }: ExportRndPanelProps) {
  return (
    <DataTableShell title="研发资料包导出">
      {projects.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无研发项目</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["项目", "编号", "费用化", "资本化", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td style={cellStyle()}>{project.name}</td>
                <td style={cellStyle()}>{project.code}</td>
                <td style={cellStyle()}>{project.summary.expenseAmount}</td>
                <td style={cellStyle()}>{project.summary.capitalizedAmount}</td>
                <td style={cellStyle()}>
                  {renderActionButton(() => onOpenProject(project), "打开研发资料包")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
