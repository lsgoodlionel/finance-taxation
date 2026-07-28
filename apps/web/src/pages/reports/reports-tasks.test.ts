import { resolveActiveTask } from "../../lib/task-focus";
import {
  buildReportsTasks,
  isStatementView,
  REPORTS_TASK_KEYS,
  resolveInitialReportsTask,
  resolveTaskByView,
  resolveViewByTask,
  STATEMENT_VIEWS
} from "./reports-tasks";
import { readReportsUrlState, writeReportsUrlState } from "./reports-url-state";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── 一次只承载四件事：区块数收敛的前提 ──────────────────────────────────────
const proTasks = buildReportsTasks("pro");
const guidedTasks = buildReportsTasks("guided");
assertEqual(proTasks.length, 4, "expected /reports to carry exactly four tasks");
assertEqual(guidedTasks.length, 4, "expected guided to carry the same four tasks");
assert(
  proTasks.every((task) => typeof task.description === "string" && task.description.length > 0),
  "expected every task to explain what it is for"
);
assertEqual(
  new Set(proTasks.map((task) => task.key)).size,
  proTasks.length,
  "expected task keys to be unique"
);

// ── V7 K3 保留：guided 先给白话结论，pro 仍落三表工作台 ─────────────────────
assertEqual(resolveInitialReportsTask("guided"), REPORTS_TASK_KEYS.chairman, "expected guided to land on the chairman summary");
assertEqual(resolveInitialReportsTask("pro"), REPORTS_TASK_KEYS.statements, "expected pro to land on the statements workbench");
assertEqual(guidedTasks[0]?.key, REPORTS_TASK_KEYS.chairman, "expected guided switcher to lead with the plain-language conclusion");
assertEqual(proTasks[0]?.key, REPORTS_TASK_KEYS.statements, "expected pro switcher to lead with the statements");

// ── 视图与任务的映射：面板由视图决定，切换器由任务决定，二者必须对齐 ────────
assertEqual(resolveTaskByView("balanceSheet"), REPORTS_TASK_KEYS.statements, "expected balance sheet to belong to the statements task");
assertEqual(resolveTaskByView("profitStatement"), REPORTS_TASK_KEYS.statements, "expected profit statement to belong to the statements task");
assertEqual(resolveTaskByView("cashFlow"), REPORTS_TASK_KEYS.statements, "expected cash flow to belong to the statements task");
assertEqual(resolveTaskByView("chairman"), REPORTS_TASK_KEYS.chairman, "expected chairman summary to be its own task");
assertEqual(resolveTaskByView("diff"), REPORTS_TASK_KEYS.compare, "expected the diff view to belong to the compare task");
assertEqual(resolveTaskByView("budgetVariance"), REPORTS_TASK_KEYS.budget, "expected budget variance to be its own task");

assertEqual(resolveViewByTask(REPORTS_TASK_KEYS.chairman), "chairman", "expected the chairman task to show the summary");
assertEqual(resolveViewByTask(REPORTS_TASK_KEYS.compare), "diff", "expected the compare task to show the diff result");
assertEqual(resolveViewByTask(REPORTS_TASK_KEYS.budget), "budgetVariance", "expected the budget task to show budget variance");
assertEqual(resolveViewByTask(REPORTS_TASK_KEYS.statements), "balanceSheet", "expected the statements task to default to the balance sheet");
assertEqual(
  resolveViewByTask(REPORTS_TASK_KEYS.statements, "cashFlow"),
  "cashFlow",
  "expected the statements task to return to the last statement read"
);
assertEqual(
  resolveViewByTask(REPORTS_TASK_KEYS.statements, "chairman"),
  "balanceSheet",
  "expected a non-statement memory to fall back to the balance sheet"
);

// 每个视图都能被任务切换器抵达：不允许改造后有孤儿视图。
const reachable = new Set(proTasks.map((task) => resolveViewByTask(task.key)));
for (const view of ["chairman", "balanceSheet", "diff", "budgetVariance"] as const) {
  assert(reachable.has(view), `expected ${view} to be reachable from the task switcher`);
}
for (const view of STATEMENT_VIEWS) {
  assert(isStatementView(view), `expected ${view} to be treated as a statement`);
  assertEqual(resolveTaskByView(view), REPORTS_TASK_KEYS.statements, `expected ${view} to map back to the statements task`);
}
assert(!isStatementView("chairman"), "expected the chairman summary not to count as a statement");

// ── URL 同步：刷新 / 分享 / 前进后退落在同一件事、同一张表 ──────────────────
assertEqual(readReportsUrlState(new URLSearchParams()).task, "", "expected an empty task when the URL says nothing");
assertEqual(
  readReportsUrlState(new URLSearchParams("task=compare")).task,
  "compare",
  "expected the task to be read from the URL"
);
assertEqual(
  readReportsUrlState(new URLSearchParams("report=cashFlow")).report,
  "cashFlow",
  "expected the statement choice to be read from the URL"
);
assertEqual(
  readReportsUrlState(new URLSearchParams("report=chairman")).report,
  "",
  "expected a non-statement report param to be discarded"
);
assertEqual(
  writeReportsUrlState({ task: "compare", report: "cashFlow" }).toString(),
  "task=compare&report=cashFlow",
  "expected both task and statement to be written"
);
assertEqual(
  writeReportsUrlState({ task: "statements", report: "balanceSheet" }).toString(),
  "task=statements",
  "expected the default statement to stay out of the URL"
);

// URL 指定的任务优先于默认值，非法值回落默认（与 /tax、/risk 一致）。
assertEqual(
  resolveActiveTask(guidedTasks, "compare", resolveInitialReportsTask("guided")),
  REPORTS_TASK_KEYS.compare,
  "expected a valid URL task to win"
);
assertEqual(
  resolveActiveTask(guidedTasks, "nope", resolveInitialReportsTask("guided")),
  REPORTS_TASK_KEYS.chairman,
  "expected an unknown URL task to fall back to the guided default"
);

console.log("reports-tasks-ok");
