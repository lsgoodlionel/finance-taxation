import React from "react";
import type { RndProjectDetail } from "../../lib/api";
import { ObjectFlowBar } from "../../components/ui/ObjectFlowBar";
import { Term } from "../../components/ui/Term";
import { buildRndProjectFlow, parseAmount, type RndTaskKey } from "./rnd-tasks";

/**
 * 当前这件事的只读上下文。
 *
 * 改造前这些数字散在两处并且重复：顶部 4 张 KPI 卡（项目数 / 累计投入 / 可扣除基数 /
 * 预计扣除额）和右侧详情卡的 8 行 Descriptions 讲的是同一批数。现在按「当前这件事
 * 需要知道什么」收缩——挑项目时看全局盘子，归集/核对时只看这一个项目。
 */

const CARD_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(248,250,252,0.9)",
  border: "1px solid rgba(20,40,60,0.08)"
};

const TITLE_STYLE: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, color: "#1e2a37" };

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12.5,
  color: "#4d5d6c"
};

const NOTE_STYLE: React.CSSProperties = { margin: 0, fontSize: 12, lineHeight: 1.7, color: "#6b7a8d" };

function money(value: string): string {
  return `¥${parseAmount(value).toLocaleString()}`;
}

interface RndContextPanelProps {
  task: RndTaskKey;
  project: RndProjectDetail | null;
  projectCount: number;
  projectsWithoutCosts: number;
  message: string;
}

export function RndContextPanel({
  task,
  project,
  projectCount,
  projectsWithoutCosts,
  message
}: RndContextPanelProps) {
  return (
    <>
      {/* 对象级流程条只在选中了具体项目时出现——没有对象就没有「这一笔走到哪了」。 */}
      {project && (
        <ObjectFlowBar
          title={`「${project.name}」办到哪了`}
          flow={buildRndProjectFlow({
            startedOn: project.startedOn,
            businessEventId: project.businessEventId,
            costLineCount: project.costLines.length,
            summary: project.summary,
            conflicts: project.policyReview.conflicts
          })}
        />
      )}

      {task === "projects" ? (
        <div style={CARD_STYLE}>
          <h3 style={TITLE_STYLE}>研发台账概览</h3>
          <div style={ROW_STYLE}>
            <span>研发项目</span>
            <strong>{projectCount} 个</strong>
          </div>
          <div style={ROW_STYLE}>
            <span>还没归集费用</span>
            <strong>{projectsWithoutCosts} 个</strong>
          </div>
          <p style={NOTE_STYLE}>
            没归集费用的项目不会产生<Term k="super-deduction">加计扣除</Term>基数。已结项的项目不计入这个待办数。
          </p>
        </div>
      ) : project ? (
        <div style={CARD_STYLE}>
          <h3 style={TITLE_STYLE}>这个项目的基本情况</h3>
          <div style={ROW_STYLE}>
            <span>项目编号</span>
            <strong>{project.code}</strong>
          </div>
          <div style={ROW_STYLE}>
            <span>立项日期</span>
            <strong>{project.startedOn}</strong>
          </div>
          <div style={ROW_STYLE}>
            <span>资本化政策</span>
            <strong>{project.capitalizationPolicy}</strong>
          </div>
          <div style={ROW_STYLE}>
            <span>费用化 / 资本化</span>
            <strong>
              {money(project.summary.expenseAmount)} / {money(project.summary.capitalizedAmount)}
            </strong>
          </div>
          <div style={ROW_STYLE}>
            <span>累计工时</span>
            <strong>{parseAmount(project.summary.totalHours)} 小时</strong>
          </div>
          <p style={NOTE_STYLE}>
            工时是备查资料，不参与<Term k="super-deduction">加计扣除</Term>基数计算（基数只看费用化金额）；本页也没有录工时的入口。
          </p>
        </div>
      ) : null}

      <p style={NOTE_STYLE} role="status">{message}</p>
    </>
  );
}
