import React from "react";
import type { ChairmanReportSummary } from "@finance-taxation/domain-model";
import { EmptyState } from "../../../components/ui/EmptyState";

type ChairmanSummaryPanelProps = {
  summary: ChairmanReportSummary | null;
};

export function ChairmanSummaryPanel({ summary }: ChairmanSummaryPanelProps) {
  if (!summary) {
    return (
      <EmptyState
        title="尚未生成老板摘要"
        description="先在左侧选择一个快照，再点击“生成老板摘要”。"
      />
    );
  }

  return (
    <section
      style={{
        display: "grid",
        gap: "16px",
        padding: "24px",
        borderRadius: "20px",
        background: "rgba(255,255,255,0.88)",
        border: "1px solid rgba(20,40,60,0.08)"
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <span style={{ fontSize: "12px", color: "#6c7a89" }}>老板摘要 · {summary.periodLabel}</span>
        <h2 style={{ margin: 0, fontSize: "22px", color: "#1e2a37" }}>{summary.headline}</h2>
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        <strong style={{ color: "#1e2a37" }}>关键信息</strong>
        <ul style={{ paddingLeft: "20px", lineHeight: 1.8, color: "#314155" }}>
          {summary.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        <strong style={{ color: "#b91c1c" }}>重点风险</strong>
        <ul style={{ paddingLeft: "20px", lineHeight: 1.8, color: "#b91c1c" }}>
          {summary.risks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
