/**
 * a11y 护栏 + 冒烟渲染：收件箱新增的两块（今天的状况 / 其他模块待办）里
 * 可点击的东西必须是原生 <button>（天然可 Tab 聚焦 + Enter/Space 激活，
 * WCAG 2.2 · SC 2.1.1），并且带得出信息量足够的可访问名称。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { InboxTodayBar } from "./InboxTodayBar";
import { InboxMoreTodos } from "./InboxMoreTodos";
import { summarizeInboxFocus, summarizeTaxDeadlines } from "./inbox-focus";
import type { InboxItem } from "../../lib/api";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const items: InboxItem[] = [
  { key: "pending_events", label: "待分析事项", count: 2, tone: "info", actionPath: "/events", hint: "经营事项待确认" },
  { key: "unmatched_statements", label: "未匹配银行流水", count: 4, tone: "warning", actionPath: "/banking", hint: "银行流水待对账" }
];

const focus = summarizeInboxFocus({
  items,
  totalPending: 9,
  tasks: [{ isOverdue: true }],
  findings: [{ status: "open", severity: "high" }],
  approvalCount: 1
});

const todayHtml = render(
  createElement(InboxTodayBar, {
    summary: focus,
    deadlines: summarizeTaxDeadlines([
      { taxType: "vat", label: "增值税", dueDate: "2026-08-15", daysLeft: 6, filed: false, urgent: false }
    ]),
    period: "2026-07",
    checklist: {
      items: [{ key: "company", label: "完善公司信息", hint: "填好公司名称和税号", actionPath: "/settings", done: false }],
      doneCount: 0,
      total: 1,
      ready: false
    },
    mode: "guided",
    allClear: false
  })
);

assert(todayHtml.includes("<button"), "到期提醒与快速开始都必须是原生 button");
assert(todayHtml.includes("前往税务中心查看到期与提醒"), "到期提醒要说清点下去会发生什么");
assert(todayHtml.includes("建议先处理逾期任务与高危风险"), "有紧急项时给出优先级建议");
assert(todayHtml.includes("快速开始"), "未完成的新手清单仍要可达");
assert(!todayHtml.includes("太棒了"), "还有待办时不该显示庆祝语");

const clearHtml = render(
  createElement(InboxTodayBar, {
    summary: summarizeInboxFocus({ items: [], totalPending: 0, tasks: [], findings: [], approvalCount: 0 }),
    deadlines: null,
    period: "2026-07",
    checklist: { items: [], doneCount: 1, total: 1, ready: true },
    mode: "pro",
    allClear: true
  })
);
assert(clearHtml.includes("太棒了"), "全清时给一句庆祝语，取代原来单独占一块的空状态卡");
assert(!clearHtml.includes("快速开始"), "配置已完成时新手清单整块消失");

const moreHtml = render(createElement(InboxMoreTodos, { items }));
assert(moreHtml.includes("<details"), "其他模块待办默认收起");
assert(moreHtml.includes("<button"), "每条仍是可键盘操作的原生 button");
assert(moreHtml.includes("未匹配银行流水 4 项"), "可访问名称要带上数量");
assert(render(createElement(InboxMoreTodos, { items: [] })) === "", "没有其他待办时整块不渲染");

console.log("inbox-today-bar-a11y-ok");
