import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type TaxHeaderProps = {
  activeMaterialLabel: string;
  onOpenHelp: () => void;
};

export function TaxHeader({ activeMaterialLabel, onOpenHelp }: TaxHeaderProps) {
  return (
    <PageHeader
      title="税务中心"
      subtitle={buildResultPageSubtitle("税务中心")}
      actions={(
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前资料视图</span>
            <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeMaterialLabel}</strong>
          </div>
          <button
            onClick={onOpenHelp}
            title="业务说明"
            style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            ?
          </button>
        </div>
      )}
    />
  );
}
