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
    <section
      style={{
        display: "grid",
        gap: "12px",
        padding: "20px 24px",
        borderRadius: "20px",
        background: "rgba(255,255,255,0.82)",
        border: "1px solid rgba(20,40,60,0.08)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前总账场景 · {scene}</span>
          <h2 style={{ margin: 0, fontSize: "18px", color: "#1e2a37" }}>{title}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#4d5d6c", lineHeight: 1.6 }}>{description}</p>
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
              background: "rgba(20,40,60,0.06)",
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
