import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { PayrollHeader } from "./PayrollHeader";
import { PayrollShell } from "./PayrollShell";
import { PayrollTaskContext } from "./PayrollTaskContext";
import { buildPayrollTasks } from "./payroll-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "link", "meta", "source"]);

/** 数根容器下的直接子元素——「首屏区块」在实测里就是按这个数的。 */
function countTopLevelBlocks(markup: string): number {
  let depth = 0;
  let count = 0;
  for (const match of markup.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClose] = match;
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 1) count += 1;
    if (!VOID_TAGS.has((name ?? "").toLowerCase()) && !selfClose) depth += 1;
  }
  return count;
}

// ── 外壳只剩「页头 + 当前这件事」两块 ───────────────────────────────────────
{
  const html = renderToStaticMarkup(
    createElement(PayrollShell, {
      header: createElement("div", null, "payroll-header"),
      content: createElement("div", null, "payroll-task-panel")
    })
  );

  assert(html.includes("payroll-header"), "expected payroll shell header slot");
  assert(html.includes("payroll-task-panel"), "expected payroll shell task panel slot");
  // 阅读顺序：先知道自己在哪，再看要办的事。
  assert(html.indexOf("payroll-header") < html.indexOf("payroll-task-panel"), "expected header before workspace");

  const blocks = countTopLevelBlocks(html);
  assert(blocks === 2, `expected 2 top-level blocks in the payroll shell, got ${blocks}`);
}

// ── 页头不再自带页内 Tab 条 ─────────────────────────────────────────────────
{
  const html = renderToStaticMarkup(createElement(PayrollHeader, { activeTaskLabel: "算这个月的工资" }));
  assert(html.includes("算这个月的工资"), "页头要显示当前正在办的这件事");
  // 改造前这三个词是页头里的第二层 Tab；它们现在只能出现在任务切换器上。
  assert(!html.includes("员工管理"), "页头不得再挂页内 Tab 条");
  assert(!html.includes("工资计算"), "页头不得再挂页内 Tab 条");
  assert(!html.includes("参数设置"), "页头不得再挂页内 Tab 条");
  assert(!html.includes("v3-tab-bar"), "页内 Tab 条已被任务切换器取代");
}

// ── 一次只有一件事进 DOM ────────────────────────────────────────────────────
{
  const tasks = buildPayrollTasks();
  const html = renderToStaticMarkup(
    createElement(TaskFocusShell, {
      tasks,
      activeKey: "employees",
      onSelectTask: () => {},
      switcherLabel: "工资这块能办的事",
      children: createElement("div", null, "workspace-employees")
    })
  );

  // 五件事都在切换器上（用户看得见还能办什么），但只有一件的工作区被渲染。
  assert((html.match(/role="tab"/g) ?? []).length === 5, "切换器上应有五件事");
  assert((html.match(/role="tabpanel"/g) ?? []).length === 1, "同时只能有一个工作区面板");
  assert((html.match(/aria-selected="true"/g) ?? []).length === 1, "同时只能选中一件事");
  assert(html.includes("workspace-employees"), "选中的那件事的工作区应被渲染");
  assert(html.includes("维护员工档案"), "切换器上应能读到当前这件事的名字");
  // 其余任务只留标签，不留工作区——不是折叠、不是隐藏，是根本不进 DOM。
  assert(!html.includes("向导"), "别的任务的工作区不得出现在 DOM 里");
}

// ── 首屏区块预算：把 /payroll 真实的组合结构拼出来数 ────────────────────────
{
  const html = renderToStaticMarkup(
    createElement(PayrollShell, {
      header: createElement(PayrollHeader, { activeTaskLabel: "算这个月的工资" }),
      content: createElement(TaskFocusShell, {
        tasks: buildPayrollTasks(),
        activeKey: "run",
        onSelectTask: () => {},
        switcherLabel: "工资这块能办的事",
        children: [
          createElement("div", { key: "workspace" }, "WORKSPACE"),
          createElement(PayrollTaskContext, {
            key: "context",
            message: "已加载 12 名员工",
            runtime: createElement("div", null, "RUNTIME"),
            runtimeAttention: false
          })
        ]
      })
    })
  );

  /**
   * 加上页面最上面的 ProPageBanner，首屏一共 5 块平级内容：
   * 横幅 / 页头 / 任务切换器（含这件事的一句说明）/ 当前任务工作区 / 上下文。
   *
   * 改造前是 8 块（?tab=manage：横幅、域页头、域 Tab 条、页头、状态横幅、
   * 页内 Tab 条、运行态面板、工作区）和 10 块（?tab=transfer：还多出三格统计行、
   * 批次清单、批次详情、分隔线、社保关账——两件不相干的事挤在同一屏）。
   */
  assert(countTopLevelBlocks(html) === 2, "外壳仍只允许页头 + 当前这件事两块");
  assert((html.match(/role="tablist"/g) ?? []).length === 1, "只能有一条任务切换器");
  assert((html.match(/role="tabpanel"/g) ?? []).length === 1, "只能有一个工作区面板");
  assert((html.match(/<aside/g) ?? []).length === 1, "状态文案与运行态合成一块上下文，不再各占一块");
  assert(html.indexOf("WORKSPACE") < html.indexOf("RUNTIME"), "工作区在前、上下文在后");

  // 运行态无异常时收起：它是背景信息，不该和当前要办的事抢首屏。
  assert(html.includes("<details"), "无异常时运行态应折叠");
  assert(html.includes("运行与授权状态（当前无异常）"), "折叠时要说清里面是什么");
}

console.log("payroll-shell-ok");
