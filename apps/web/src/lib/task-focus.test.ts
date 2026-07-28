import { resolveActiveTask, resolveTaskByArrowKey, sortTasksByUrgency, type TaskDef } from "./task-focus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const tasks: TaskDef[] = [
  { key: "declare", label: "申报这个月的税", badge: 2 },
  { key: "check", label: "核对上月差异" },
  { key: "archive", label: "整理留存资料", badge: 5 }
];

// ── resolveActiveTask：URL 优先 ─────────────────────────────────────────────
assert(resolveActiveTask(tasks, "check") === "check", "expected url task to win");
assert(
  resolveActiveTask(tasks, "check", "archive") === "check",
  "expected url task to win over fallback"
);

// URL 非法（不在任务列表里）→ 回退到默认值，而不是原样透传
assert(
  resolveActiveTask(tasks, "not-a-task", "archive") === "archive",
  "expected invalid url task to fall back to provided fallback"
);

// URL 与默认值都非法 → 第一个任务
assert(
  resolveActiveTask(tasks, "not-a-task", "also-bogus") === "declare",
  "expected both invalid to fall back to first task"
);

// URL 缺失（null / undefined / 空串）的各种形态都不应被当成合法值
assert(resolveActiveTask(tasks, null) === "declare", "expected null url to fall back to first task");
assert(resolveActiveTask(tasks, undefined) === "declare", "expected undefined url to fall back");
assert(resolveActiveTask(tasks, "") === "declare", "expected empty url to fall back");
assert(
  resolveActiveTask(tasks, null, "check") === "check",
  "expected fallback to be used when url absent"
);

// 空任务列表 → null（页面据此不渲染切换器）
assert(resolveActiveTask([], "declare", "check") === null, "expected null for empty task list");

// ── sortTasksByUrgency：有待办的浮上来，其余保持声明顺序 ────────────────────
const sorted = sortTasksByUrgency(tasks);
assert(
  sorted.map((task) => task.key).join(",") === "archive,declare,check",
  `expected urgency order, got ${sorted.map((task) => task.key).join(",")}`
);
assert(tasks[0]?.key === "declare", "expected sortTasksByUrgency not to mutate input");

const noBadges: TaskDef[] = [{ key: "a", label: "甲" }, { key: "b", label: "乙" }];
assert(
  sortTasksByUrgency(noBadges).map((task) => task.key).join(",") === "a,b",
  "expected declaration order preserved when no badges"
);

// ── resolveTaskByArrowKey：方向键在标签间移动，到头回绕 ─────────────────────
assert(resolveTaskByArrowKey(tasks, "declare", "ArrowRight") === "check", "expected right to advance");
assert(resolveTaskByArrowKey(tasks, "declare", "ArrowDown") === "check", "expected down to advance");
assert(resolveTaskByArrowKey(tasks, "check", "ArrowLeft") === "declare", "expected left to go back");
assert(resolveTaskByArrowKey(tasks, "check", "ArrowUp") === "declare", "expected up to go back");
assert(resolveTaskByArrowKey(tasks, "archive", "ArrowRight") === "declare", "expected wrap to first");
assert(resolveTaskByArrowKey(tasks, "declare", "ArrowLeft") === "archive", "expected wrap to last");
assert(resolveTaskByArrowKey(tasks, "check", "Home") === "declare", "expected Home to jump first");
assert(resolveTaskByArrowKey(tasks, "check", "End") === "archive", "expected End to jump last");

// 非导航键不拦截（组件据此不 preventDefault，Tab / Enter 等原生行为保留）
assert(resolveTaskByArrowKey(tasks, "check", "Tab") === null, "expected Tab to be ignored");
assert(resolveTaskByArrowKey(tasks, "check", "Enter") === null, "expected Enter to be ignored");
assert(resolveTaskByArrowKey(tasks, "check", "a") === null, "expected letter keys to be ignored");

// activeKey 异常时以第一个任务为基准，不抛错
assert(resolveTaskByArrowKey(tasks, null, "ArrowRight") === "check", "expected null active to start at first");
assert(
  resolveTaskByArrowKey(tasks, "bogus", "ArrowLeft") === "archive",
  "expected unknown active to be treated as first"
);

// 空列表任何键都返回 null
assert(resolveTaskByArrowKey([], null, "ArrowRight") === null, "expected null for empty task list");

// 单个任务时左右键都停在原地
const single: TaskDef[] = [{ key: "only", label: "唯一一件事" }];
assert(resolveTaskByArrowKey(single, "only", "ArrowRight") === "only", "expected single task to stay");
assert(resolveTaskByArrowKey(single, "only", "ArrowLeft") === "only", "expected single task to stay");

console.log("task-focus-ok");
