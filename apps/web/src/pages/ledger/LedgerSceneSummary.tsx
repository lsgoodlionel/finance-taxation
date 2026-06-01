import React from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import type { LedgerSceneKey } from "./types";

type LedgerSceneSummaryProps = {
  scene: LedgerSceneKey;
  title: string;
  description: string;
  highlights: string[];
  pendingCount?: number;
};

export function LedgerSceneSummary({ scene, title, description, highlights, pendingCount }: LedgerSceneSummaryProps) {
  return (
    <section style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div className="v3-section-heading" style={{ gap: "6px" }}>
          <span className="v3-section-kicker">当前总账场景 · {scene}</span>
          <h2 className="v3-section-title">{title}</h2>
          <p className="v3-section-description">{description}</p>
        </div>
        {typeof pendingCount === "number" ? (
          <div style={{ minWidth: "120px", textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前范围</div>
            <strong style={{ fontSize: "24px", color: "#1e2a37" }}>{pendingCount}</strong>
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {highlights.map((highlight) => (
          <span
            key={highlight}
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              background: "rgba(79,142,247,0.08)",
              color: "#425466",
              fontSize: "12px"
            }}
          >
            {highlight}
          </span>
        ))}
      </div>
      <ResultBanner tone="info" message="先确认当前账本场景和过滤条件，再查看分录、资金日记账或锁账结果。详情操作保持原有 API，不改变现有总账业务规则。" />
    </section>
  );
}
