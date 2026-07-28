import type { TaxFilingBatch, TaxItem } from "@finance-taxation/domain-model";
import { resolveActiveTask } from "../../lib/task-focus";
import {
  TAX_TASK_KEYS,
  TAX_TASK_QUERY_KEY,
  buildTaxTasks,
  countOpenBatches,
  countUnreadyItems
} from "./tax-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeBatch(id: string, status: TaxFilingBatch["status"]): TaxFilingBatch {
  return {
    id,
    companyId: "c1",
    taxType: "增值税",
    filingPeriod: "2026-05",
    status,
    itemIds: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };
}

function makeItem(id: string, status: TaxItem["status"]): TaxItem {
  return {
    id,
    companyId: "c1",
    businessEventId: "evt-1",
    mappingId: "map-1",
    taxType: "增值税",
    treatment: "销项计税",
    basis: "含税收入",
    filingPeriod: "2026-05",
    status,
    source: "analysis",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };
}

const batches: TaxFilingBatch[] = [
  makeBatch("b-draft", "draft"),
  makeBatch("b-review", "review_required"),
  makeBatch("b-ready", "ready"),
  makeBatch("b-submitted", "submitted"),
  makeBatch("b-archived", "archived")
];

const items: TaxItem[] = [
  makeItem("i-1", "ready"),
  makeItem("i-2", "pending"),
  makeItem("i-3", "review_required")
];

// ── 角标口径：只数「还要办的」，已提交/已留档不再催 ──────────────────────────
assert(countOpenBatches(batches) === 3, `expected 3 open batches, got ${countOpenBatches(batches)}`);
assert(countOpenBatches([]) === 0, "expected zero for an empty batch list");
assert(countUnreadyItems(items) === 2, `expected 2 unready items, got ${countUnreadyItems(items)}`);
assert(countUnreadyItems([makeItem("i-4", "ready")]) === 0, "expected zero when everything is ready");

// ── 任务划分：13 个平级区块收敛成 6 件事 ────────────────────────────────────
const tasks = buildTaxTasks({ batches, items, overdueCount: 2 });
assert(
  tasks.map((task) => task.key).join(",") === "declare,materials,calendar,items,profile,export",
  `expected the declared task order, got ${tasks.map((task) => task.key).join(",")}`
);
assert(tasks.length === 6, "expected six tasks");
assert(
  tasks.every((task) => typeof task.description === "string" && task.description.length > 0),
  "expected every task to explain itself in one sentence"
);
// 任务名是动词短语（用户视角的「我要做什么」），不是模块名
assert(tasks[0]?.label === "申报这个月的税", "expected the main task to read as an action");

// ── 角标来自真实待办，不是常量 ──────────────────────────────────────────────
const byKey = new Map(tasks.map((task) => [task.key, task]));
assert(byKey.get(TAX_TASK_KEYS.declare)?.badge === 3, "expected the declare badge to count open batches");
assert(byKey.get(TAX_TASK_KEYS.calendar)?.badge === 2, "expected the calendar badge to count overdue taxes");
assert(byKey.get(TAX_TASK_KEYS.items)?.badge === 2, "expected the items badge to count unready items");
// 低频配置类任务不挂角标，免得永远亮着一个数字
assert(byKey.get(TAX_TASK_KEYS.profile)?.badge === undefined, "expected no badge on the profile task");
assert(byKey.get(TAX_TASK_KEYS.materials)?.badge === undefined, "expected no badge on the materials task");
assert(byKey.get(TAX_TASK_KEYS.export)?.badge === undefined, "expected no badge on the export task");

// 全部办完时角标归零（TaskFocusShell 对 0 不渲染角标）
const quiet = buildTaxTasks({
  batches: [makeBatch("b-archived", "archived")],
  items: [makeItem("i-1", "ready")],
  overdueCount: 0
});
assert(
  quiet.every((task) => (task.badge ?? 0) === 0),
  "expected no outstanding badges when nothing is pending"
);

// ── URL 同步：?task= 决定当前这件事，非法值回落到主任务 ──────────────────────
assert(TAX_TASK_QUERY_KEY === "task", "expected the task query key to stay stable for deep links");
assert(
  resolveActiveTask(tasks, "materials", TAX_TASK_KEYS.declare) === "materials",
  "expected the url to win so a shared link lands on the same task"
);
assert(
  resolveActiveTask(tasks, "", TAX_TASK_KEYS.declare) === "declare",
  "expected a bare /tax to open the main task"
);
assert(
  resolveActiveTask(tasks, "no-such-task", TAX_TASK_KEYS.declare) === "declare",
  "expected an unknown ?task= to fall back instead of blanking the page"
);
// 所有任务 key 都能被 URL 直达
for (const key of Object.values(TAX_TASK_KEYS)) {
  assert(resolveActiveTask(tasks, key, TAX_TASK_KEYS.declare) === key, `expected ?task=${key} to resolve`);
}

console.log("tax-tasks-ok");
