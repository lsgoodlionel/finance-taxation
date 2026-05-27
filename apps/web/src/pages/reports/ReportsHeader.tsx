import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type ReportsHeaderProps = {
  activeViewLabel: string;
  onNavigateToExportCenter: () => void;
};

export function ReportsHeader({ activeViewLabel, onNavigateToExportCenter }: ReportsHeaderProps) {
  return (
    <PageHeader
      title="财务报表中心"
      subtitle={buildResultPageSubtitle("财务报表")}
      actions={(
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "grid", gap: "4px", textAlign: "right" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前视图</span>
            <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeViewLabel}</strong>
          </div>
          <button className="btn btn-outline" onClick={onNavigateToExportCenter}>
            前往 PDF 导出中心
          </button>
        </div>
      )}
    />
  );
}
