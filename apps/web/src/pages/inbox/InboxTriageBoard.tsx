/**
 * 收件箱 · 「今天要处理的」三张导航型摘要卡。
 *
 * 为什么是并排而不是任务切换器（TaskFocusShell）：
 * 收件箱的价值恰恰是「一眼看全今天有什么」。拆成 4 个 tab 会把 3/4 的内容移出
 * DOM，用户得点 4 次才知道今天有几件事——与这一页的职责相反。
 *
 * 为什么把 4 张卡拆成「三张并排 + AI 草稿单独一块」：
 * 四张卡纵向全宽堆叠是「并排」的最差实现，每张近一屏，第四张要滚过三屏才看到。
 * 而这四张卡的性质本就不同：待办任务 / 风险预警 / 审批请求都是**导航型摘要**
 * （每一行点下去都是跳到对应中心处理），AI 草稿是唯一**能就地做完**的工作台
 * （勾选、批量批准/驳回、属期选择、键盘热键）。按性质归拢：三张摘要并排成
 * 「今天要处理的」，AI 草稿留在下面独立成块。
 */
import React from "react";
import type { RiskFinding, WorkflowRun } from "@finance-taxation/domain-model";
import { InboxTasksCard } from "./InboxTasksCard";
import { InboxRiskCard } from "./InboxRiskCard";
import { InboxApprovalsCard } from "./InboxApprovalsCard";
import type { TaskWithOverdue } from "./inbox-helpers";

const HEADING_ID = "inbox-triage-heading";

const HEADING_STYLE: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 16,
  lineHeight: 1.3,
  color: "#1e2a37"
};

/**
 * 卡片最窄 340px：再窄下去「标题 + 截止 + 两个标签」会挤成两行，
 * 反而更难扫读。宽屏三列、中屏两列、窄屏单列，全部由 auto-fit 自然降级。
 */
const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 16,
  alignItems: "start"
};

interface InboxTriageBoardProps {
  tasks: TaskWithOverdue[];
  findings: RiskFinding[];
  runs: WorkflowRun[];
  loading: boolean;
}

export function InboxTriageBoard({ tasks, findings, runs, loading }: InboxTriageBoardProps) {
  return (
    <section aria-labelledby={HEADING_ID} data-testid="inbox-triage-board">
      <h2 id={HEADING_ID} style={HEADING_STYLE}>今天要处理的</h2>
      <div style={GRID_STYLE}>
        <InboxTasksCard tasks={tasks} loading={loading} />
        <InboxRiskCard findings={findings} loading={loading} />
        <InboxApprovalsCard runs={runs} loading={loading} />
      </div>
    </section>
  );
}
