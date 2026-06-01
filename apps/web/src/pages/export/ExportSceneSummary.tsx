import React from "react";
import { ResultBanner } from "../../components/ui/ResultBanner";
import type { ExportSceneKey } from "./ExportSceneSelector";

const SCENE_LABELS: Record<ExportSceneKey, string> = {
  reports: "财务报表",
  payroll: "工资材料",
  tax: "税务材料",
  packages: "批量归档",
  documents: "单据模板",
  risk: "风险复盘",
  rnd: "研发辅助",
  vouchers: "凭证导出"
};

type ExportSceneSummaryProps = {
  scene: ExportSceneKey;
  title: string;
  description: string;
  highlights: string[];
  pendingCount?: number;
};

export function ExportSceneSummary({ scene, title, description, highlights, pendingCount }: ExportSceneSummaryProps) {
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
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前导出场景 · {SCENE_LABELS[scene]}</span>
          <h2 style={{ margin: 0, fontSize: "18px", color: "#1e2a37" }}>{title}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#4d5d6c", lineHeight: 1.6 }}>{description}</p>
        </div>
        {typeof pendingCount === "number" ? (
          <div style={{ minWidth: "120px", textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前待处理</div>
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
      <ResultBanner tone="info" message="先确认当前场景和参数，再执行单项或批量导出。导出历史和归档索引位于结果区，可用于复用和追踪。" />
    </section>
  );
}
