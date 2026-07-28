/**
 * V10「我这一笔走到哪了」的流程条带。
 *
 * 与 components/FinanceFlowBar 的区别（务必分清，否则用户会在一个页面上
 * 看到两条外观相近的条而搞混）：
 * - FinanceFlowBar：全站固定的 10 个环节导航，done/current 由「当前在哪个页面」
 *   的数组下标算出，与业务数据无关，点击是跳页面。它回答「系统有哪些环节」。
 * - ObjectFlowBar（本组件）：某一个业务对象的办理进度，每步状态来自该对象的
 *   真实字段（见 lib/object-flow.ts 的 buildObjectFlow），并带上「在等什么、
 *   谁来办、关联了哪些单子」。它回答「我手上这一笔卡在哪」。
 *
 * 视觉上刻意做了区分：FinanceFlowBar 是渐变胶囊 + 数字圆点的整幅导航条；
 * 本组件是带标题的小节内一行细排步骤 + 一条「现在这步」说明，明显更轻。
 */
import React from "react";
import type { FlowStepStatus, ObjectFlow, ObjectFlowStep } from "../../lib/object-flow";
import { EntityLink } from "./EntityLink";

export interface ObjectFlowBarProps {
  flow: ObjectFlow;
  /** 条带标题，建议带上对象本身（如「这张单子办到哪了」）。 */
  title?: string;
}

interface StatusStyle {
  /** 读屏用的状态词——状态不能只靠颜色传达（WCAG 1.4.1）。 */
  label: string;
  /** 视觉标记，同时也是非颜色的状态线索。 */
  glyph: string;
  color: string;
  markerBackground: string;
  markerColor: string;
}

const STATUS_STYLES: Record<FlowStepStatus, StatusStyle> = {
  done: { label: "已办完", glyph: "✓", color: "#15803d", markerBackground: "#16a34a", markerColor: "#fff" },
  current: { label: "正在办", glyph: "●", color: "#1d4ed8", markerBackground: "#2563eb", markerColor: "#fff" },
  blocked: { label: "卡住了", glyph: "!", color: "#b45309", markerBackground: "#f59e0b", markerColor: "#fff" },
  pending: { label: "还没轮到", glyph: "○", color: "#94a3b8", markerBackground: "rgba(20,40,60,0.10)", markerColor: "#64748b" }
};

const OVERALL_TONE: Record<ObjectFlow["overall"], { text: string; color: string }> = {
  done: { text: "全部办完", color: "#15803d" },
  blocked: { text: "卡住了", color: "#b45309" },
  in_progress: { text: "办理中", color: "#1d4ed8" }
};

const SHELL_STYLE: React.CSSProperties = { display: "grid", gap: 10, padding: "12px 16px" };

const HEAD_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12
};

const TITLE_STYLE: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.4, color: "#1e2a37" };

const RAIL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 0,
  listStyle: "none",
  margin: 0,
  padding: "0 0 2px",
  overflowX: "auto",
  WebkitOverflowScrolling: "touch"
};

const STEP_ITEM_STYLE: React.CSSProperties = { display: "flex", alignItems: "flex-start", flexShrink: 0 };

const MARKER_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  borderRadius: "50%",
  fontSize: 10,
  lineHeight: "16px",
  flexShrink: 0
};

const CONNECTOR_STYLE: React.CSSProperties = {
  width: 18,
  height: 1,
  margin: "9px 6px 0",
  background: "rgba(20,40,60,0.16)",
  flexShrink: 0
};

const RELATED_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 11,
  marginTop: 2
};

const CALLOUT_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "4px 14px",
  padding: "8px 12px",
  borderRadius: 12,
  background: "rgba(37,99,235,0.06)",
  fontSize: 13,
  color: "#1e2a37"
};

const BLOCKED_CALLOUT_STYLE: React.CSSProperties = {
  ...CALLOUT_STYLE,
  background: "rgba(245,158,11,0.10)"
};

const DONE_CALLOUT_STYLE: React.CSSProperties = {
  ...CALLOUT_STYLE,
  background: "rgba(22,163,74,0.10)",
  color: "#15803d"
};

const MUTED_LABEL_STYLE: React.CSSProperties = { color: "#6b7a8d" };

function renderRelated(step: ObjectFlowStep) {
  const related = step.related ?? [];
  if (related.length === 0) return null;
  return (
    <span style={RELATED_ROW_STYLE}>
      {related.map((object) => (
        <EntityLink key={`${object.kind}:${object.id}`} kind={object.kind} id={object.id}>
          {object.label ?? object.id}
        </EntityLink>
      ))}
    </span>
  );
}

export function ObjectFlowBar({ flow, title = "这一笔办到哪了" }: ObjectFlowBarProps) {
  if (flow.steps.length === 0) {
    return null;
  }

  const activeStep =
    flow.steps.find((step) => step.status === "current" || step.status === "blocked") ?? null;

  return (
    <section className="v3-section-shell" data-tone="muted" style={SHELL_STYLE}>
      <div style={HEAD_STYLE}>
        <h3 style={TITLE_STYLE}>{title}</h3>
        <span style={{ fontSize: 12, color: OVERALL_TONE[flow.overall].color }}>
          {OVERALL_TONE[flow.overall].text}
        </span>
      </div>

      <ol style={RAIL_STYLE} aria-label="办理步骤">
        {flow.steps.map((step, index) => {
          const tone = STATUS_STYLES[step.status];
          return (
            <li
              key={step.key}
              style={STEP_ITEM_STYLE}
              aria-current={step.status === "current" || step.status === "blocked" ? "step" : undefined}
            >
              {index > 0 ? <span style={CONNECTOR_STYLE} aria-hidden="true" /> : null}
              <span style={{ display: "grid", gap: 2 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    role="img"
                    aria-label={tone.label}
                    style={{ ...MARKER_STYLE, background: tone.markerBackground, color: tone.markerColor }}
                  >
                    {tone.glyph}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      whiteSpace: "nowrap",
                      color: tone.color,
                      fontWeight: step.status === "current" || step.status === "blocked" ? 700 : 500
                    }}
                  >
                    {step.label}
                  </span>
                </span>
                {renderRelated(step)}
              </span>
            </li>
          );
        })}
      </ol>

      {activeStep ? (
        <div style={activeStep.status === "blocked" ? BLOCKED_CALLOUT_STYLE : CALLOUT_STYLE} role="status">
          <span>
            <span style={MUTED_LABEL_STYLE}>现在这步：</span>
            <strong>{activeStep.label}</strong>
          </span>
          {activeStep.hint ? (
            <span>
              <span style={MUTED_LABEL_STYLE}>在等：</span>
              {activeStep.hint}
            </span>
          ) : null}
          {activeStep.owner ? (
            <span>
              <span style={MUTED_LABEL_STYLE}>由谁办：</span>
              {activeStep.owner}
            </span>
          ) : null}
        </div>
      ) : null}

      {flow.overall === "done" ? (
        <div style={DONE_CALLOUT_STYLE} role="status">
          这一笔的每一步都办完了，无需再操作。
        </div>
      ) : null}
    </section>
  );
}
