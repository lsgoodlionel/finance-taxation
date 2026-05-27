import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type LedgerHeaderProps = {
  activeSceneLabel: string;
};

export function LedgerHeader({ activeSceneLabel }: LedgerHeaderProps) {
  return (
    <PageHeader
      title="总账中心"
      subtitle={buildResultPageSubtitle("总账中心")}
      actions={(
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前场景</span>
          <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeSceneLabel}</strong>
        </div>
      )}
    />
  );
}
