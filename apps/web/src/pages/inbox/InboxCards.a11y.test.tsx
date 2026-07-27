/**
 * a11y 护栏：收件箱三张卡片（待办任务 / 风险预警 / 审批请求）里可点击的行
 * 必须是原生 <button>（天然可 Tab 聚焦 + Enter/Space 激活），不得退化回
 * 只响应鼠标 onClick 的 <div>（WCAG 2.2 · SC 2.1.1 Keyboard）。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InboxTasksCard } from "./InboxTasksCard";
import { InboxRiskCard } from "./InboxRiskCard";
import { InboxApprovalsCard } from "./InboxApprovalsCard";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const tasksHtml = render(
  createElement(InboxTasksCard, {
    loading: false,
    tasks: [
      { id: "t1", title: "补充报销发票", dueAt: "2026-07-20", priority: "high", isOverdue: false, status: "todo" } as never
    ]
  })
);
assert(tasksHtml.includes("<button"), "expected InboxTasksCard row to render as a native button");
assert(!/<div[^>]*onclick/i.test(tasksHtml), "expected no click-only <div> rows in InboxTasksCard");

const riskHtml = render(
  createElement(InboxRiskCard, {
    loading: false,
    findings: [
      { id: "r1", title: "进项税异常", detail: "本期进项税额环比异常增长", severity: "high", status: "open" } as never
    ]
  })
);
assert(riskHtml.includes("<button"), "expected InboxRiskCard row to render as a native button");
assert(riskHtml.includes('aria-label='), "expected InboxRiskCard row to expose a descriptive accessible name");

const approvalsHtml = render(
  createElement(InboxApprovalsCard, {
    loading: false,
    runs: [
      { id: "a1", resourceType: "voucher", resourceLabel: "5,200 元报销凭证", initiatorName: "张三" } as never
    ]
  })
);
assert(approvalsHtml.includes("<button"), "expected InboxApprovalsCard row to render as a native button");
