/**
 * 「处理风险发现」这件事的工作区。
 *
 * 一件事的内部分四步看：先看总量（KPI）、再从列表里挑一条、在处置工作台看它
 * 走到哪了并关闭、最后是这条风险的关闭复盘记录。这四块都服务同一个动作，
 * 所以放在同一个任务面板里；票税比对和异常扫描是另外两件事，不在这里。
 */
import React, { type ReactNode } from "react";

const GRID_STYLE: React.CSSProperties = { display: "grid", gap: 16 };

const STACK_STYLE: React.CSSProperties = { display: "grid", gap: 16, minWidth: 0 };

export type RiskFindingsWorkspaceProps = {
  kpiCards: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  timeline: ReactNode;
};

export function RiskFindingsWorkspace({ kpiCards, list, detail, timeline }: RiskFindingsWorkspaceProps) {
  return (
    <div style={GRID_STYLE}>
      {kpiCards}
      <div className="v3-result-grid v3-result-grid--wide">
        {list}
        <div style={STACK_STYLE}>
          {detail}
          {timeline}
        </div>
      </div>
    </div>
  );
}
