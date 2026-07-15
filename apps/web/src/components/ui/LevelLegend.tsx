import React from "react";

/**
 * 级别图例：以「彩色级别名 + 白话解释」逐行展示，
 * 常用于 HelpPanel 的自定义节点（如风险严重级别解释表）。
 */

export interface LevelLegendItem {
  label: string;
  color: string;
  description: string;
}

/** 风险严重级别解释表（源自风险勾稽中心帮助弹窗，可复用）。 */
export const RISK_SEVERITY_LEVELS: readonly LevelLegendItem[] = [
  { label: "致命", color: "#dc2626", description: "重大合规违规，必须立即处理" },
  { label: "高危", color: "#d97706", description: "存在较高财税风险，建议优先整改" },
  { label: "中危", color: "#2563eb", description: "存在潜在风险，建议关注并评估" },
  { label: "低危", color: "#6c7a89", description: "轻微问题，酌情处理" }
] as const;

interface LevelLegendProps {
  title?: string;
  items: readonly LevelLegendItem[];
}

export function LevelLegend({ title, items }: LevelLegendProps) {
  return (
    <div>
      {title ? <strong>{title}</strong> : null}
      <div style={{ display: "grid", gap: "4px", marginTop: title ? "6px" : 0 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span style={{ color: item.color, fontWeight: 700, minWidth: "32px" }}>{item.label}</span>
            <span>{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
