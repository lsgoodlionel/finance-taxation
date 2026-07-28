import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskFocusShell, taskPanelId, taskTabId } from "./TaskFocusShell";
import type { TaskDef } from "../../lib/task-focus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const tasks: TaskDef[] = [
  { key: "declare", label: "申报这个月的税", description: "把本月要交的税算清楚并提交", badge: 3 },
  { key: "check", label: "核对上月差异" },
  { key: "archive", label: "整理留存资料", badge: 0 }
];

function noop(): void {
  // 静态渲染不触发回调
}

// ── 一次只渲染一件事：非当前任务的工作区不进 DOM ────────────────────────────
const html = render(
  createElement(
    TaskFocusShell,
    { tasks, activeKey: "declare", onSelectTask: noop, children: createElement("p", null, "申报工作区内容") }
  )
);
assert(html.includes("申报工作区内容"), "expected active workspace rendered");
assert(!html.includes("核对工作区内容"), "expected only one workspace rendered at a time");

// 切换器把其余任务收成一行标签，标签本身仍在（用户要看得见还有什么可做）
assert(html.includes("申报这个月的税"), "expected active task label in switcher");
assert(html.includes("核对上月差异"), "expected inactive task label in switcher");
assert(html.includes("整理留存资料"), "expected third task label in switcher");

// 当前任务的一句话说明跟着当前任务走
assert(html.includes("把本月要交的税算清楚并提交"), "expected active task description");

// ── a11y：tablist / tab / tabpanel 的完整关系 ──────────────────────────────
assert(html.includes('role="tablist"'), "expected tablist role");
assert(html.includes('aria-label="当前要做的事"'), "expected default switcher label");
assert(html.includes('aria-orientation="horizontal"'), "expected orientation hint");
assert((html.match(/role="tab"/g) ?? []).length === 3, "expected one tab per task");
assert(html.includes('role="tabpanel"'), "expected tabpanel role");
assert(html.includes(`id="${taskTabId("declare")}"`), "expected tab id");
assert(html.includes(`id="${taskPanelId("declare")}"`), "expected panel id");
assert(
  html.includes(`aria-labelledby="${taskTabId("declare")}"`),
  "expected panel labelled by the active tab"
);
assert(
  html.includes(`aria-controls="${taskPanelId("declare")}"`),
  "expected active tab to point at the rendered panel"
);
// 未激活的标签没有对应的面板元素，不该谎报 aria-controls
assert(
  (html.match(/aria-controls=/g) ?? []).length === 1,
  "expected aria-controls only on the active tab"
);

// aria-selected 恰好一个 true
assert((html.match(/aria-selected="true"/g) ?? []).length === 1, "expected exactly one selected tab");
assert((html.match(/aria-selected="false"/g) ?? []).length === 2, "expected other tabs unselected");

// roving tabindex：只有当前标签能被 Tab 进入，其余靠方向键
assert((html.match(/tabindex="0"/g) ?? []).length === 1, "expected exactly one tabbable tab");
assert((html.match(/tabindex="-1"/g) ?? []).length === 2, "expected other tabs removed from tab order");

// 角标只有数字，读屏名称补成完整短语
assert(html.includes('aria-label="申报这个月的税，待办 3 项"'), `expected badge aria-label, got ${html}`);
// badge 为 0 不渲染角标（0 不是待办）
assert(!html.includes("整理留存资料，待办 0 项"), "expected zero badge to be omitted from label");

// ── 自定义切换器名称 ────────────────────────────────────────────────────────
const namedHtml = render(
  createElement(
    TaskFocusShell,
    { tasks, activeKey: "check", onSelectTask: noop, switcherLabel: "这个页面能办的事", children: "内容" }
  )
);
assert(namedHtml.includes('aria-label="这个页面能办的事"'), "expected custom switcher label");
assert(namedHtml.includes(`aria-labelledby="${taskTabId("check")}"`), "expected panel to follow active key");

// ── activeKey 非法：仍保证切换器里有一个可 Tab 进入的落点 ──────────────────
const strayHtml = render(createElement(TaskFocusShell, { tasks, activeKey: "bogus", onSelectTask: noop, children: "内容" }));
assert((strayHtml.match(/tabindex="0"/g) ?? []).length === 1, "expected a tabbable fallback tab");
assert(!strayHtml.includes('aria-selected="true"'), "expected no tab selected for unknown active key");
assert(!strayHtml.includes('role="tabpanel"'), "expected no labelled panel for unknown active key");
assert(strayHtml.includes("内容"), "expected children still rendered for unknown active key");

// ── 只有一件事：不摆 tablist（一个 tab 的切换器是纯噪音），改用标题 ─────────
const singleHtml = render(
  createElement(
    TaskFocusShell,
    {
      tasks: [{ key: "only", label: "把这个月的账做完", description: "唯一一件事" }],
      activeKey: "only",
      onSelectTask: noop,
      children: "工作区"
    }
  )
);
assert(!singleHtml.includes('role="tablist"'), "expected no tablist for a single task");
assert(!singleHtml.includes('role="tab"'), "expected no tab role for a single task");
assert(!singleHtml.includes('role="tabpanel"'), "expected no orphan tabpanel without a tablist");
assert(singleHtml.includes("<h2"), "expected a heading instead of a one-tab switcher");
assert(singleHtml.includes("把这个月的账做完"), "expected single task label as heading");
assert(singleHtml.includes("工作区"), "expected children rendered for single task");

// ── 空任务列表：只渲染 children，不报错 ─────────────────────────────────────
const emptyHtml = render(createElement(TaskFocusShell, { tasks: [], activeKey: null, onSelectTask: noop, children: "兜底内容" }));
assert(emptyHtml.includes("兜底内容"), "expected children rendered with no tasks");
assert(!emptyHtml.includes('role="tablist"'), "expected no switcher with no tasks");
assert(!emptyHtml.includes("<h2"), "expected no heading with no tasks");

// ── aside：可选的只读上下文，排在工作区之后且有自己的可访问名称 ─────────────
const asideHtml = render(
  createElement(
    TaskFocusShell,
    {
      tasks,
      activeKey: "declare",
      onSelectTask: noop,
      aside: createElement("span", null, "上下文信息"),
      children: "主体"
    }
  )
);
assert(asideHtml.includes("<aside"), "expected aside element");
assert(asideHtml.includes('aria-label="这件事的相关信息"'), "expected aside accessible name");
assert(
  asideHtml.indexOf("主体") < asideHtml.indexOf("上下文信息"),
  "expected aside to come after the workspace in reading order"
);
assert(!html.includes("<aside"), "expected no aside when prop omitted");

console.log("task-focus-shell-ok");
