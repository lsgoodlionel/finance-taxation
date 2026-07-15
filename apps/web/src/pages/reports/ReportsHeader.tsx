import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { HelpTriggerButton } from "../../components/ui/HelpPanel";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type ReportsHeaderProps = {
  activeViewLabel: string;
  onNavigateToExportCenter: () => void;
  onNavigateToTax: () => void;
  onOpenHelp?: () => void;
};

export function ReportsHeader({ activeViewLabel, onNavigateToExportCenter, onNavigateToTax, onOpenHelp }: ReportsHeaderProps) {
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
          <button className="btn btn-outline" onClick={onNavigateToTax}>
            去税务申报
          </button>
          <button className="btn btn-outline" onClick={onNavigateToExportCenter}>
            前往 PDF 导出中心
          </button>
          {onOpenHelp ? <HelpTriggerButton onClick={onOpenHelp} label="查看财务报表中心操作说明" /> : null}
        </div>
      )}
    />
  );
}
