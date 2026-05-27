import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type ExportHeaderProps = {
  activeSceneLabel: string;
};

export function ExportHeader({ activeSceneLabel }: ExportHeaderProps) {
  return (
    <PageHeader
      title="PDF 导出中心"
      subtitle={buildResultPageSubtitle("PDF 导出")}
      actions={(
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前场景</span>
          <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeSceneLabel}</strong>
        </div>
      )}
    />
  );
}
