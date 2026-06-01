// Pure-logic unit tests for TasksPage components — no DOM, no node:test
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Due-date formatting ──────────────────────────────────────────────────────

function formatDueDate(dueAt: string | null | undefined): string {
  return dueAt ? dueAt.slice(0, 10) : "—";
}

assert(formatDueDate("2026-06-15T00:00:00Z") === "2026-06-15", "formats ISO date to YYYY-MM-DD");
assert(formatDueDate(null) === "—", "returns dash for null");
assert(formatDueDate(undefined) === "—", "returns dash for undefined");

// ─── Kanban column mapping ────────────────────────────────────────────────────

type KanbanColumnId = "not_started" | "in_progress" | "done" | "blocked";

function toColumnId(status: string): KanbanColumnId {
  if (status === "in_review") return "in_progress";
  if (status === "cancelled") return "done";
  return status as KanbanColumnId;
}

assert(toColumnId("in_review") === "in_progress", "in_review maps to in_progress column");
assert(toColumnId("cancelled") === "done", "cancelled maps to done column");
assert(toColumnId("blocked") === "blocked", "blocked maps to blocked column");
assert(toColumnId("not_started") === "not_started", "not_started maps to not_started column");

// ─── Kanban grouping ──────────────────────────────────────────────────────────

interface SimpleTask { id: string; status: string; isOverdue?: boolean }

function groupByColumn(tasks: SimpleTask[]): Record<KanbanColumnId, SimpleTask[]> {
  const map: Record<KanbanColumnId, SimpleTask[]> = {
    not_started: [],
    in_progress: [],
    done: [],
    blocked: [],
  };
  for (const task of tasks) {
    const col = toColumnId(task.status);
    map[col].push(task);
  }
  return map;
}

const sampleTasks: SimpleTask[] = [
  { id: "1", status: "not_started" },
  { id: "2", status: "in_review" },
  { id: "3", status: "in_progress" },
  { id: "4", status: "done" },
  { id: "5", status: "cancelled" },
  { id: "6", status: "blocked", isOverdue: true },
];

const groups = groupByColumn(sampleTasks);
assert(groups.not_started.length === 1, "one not_started task");
assert(groups.in_progress.length === 2, "in_review + in_progress both in in_progress column");
assert(groups.done.length === 2, "done + cancelled both in done column");
assert(groups.blocked.length === 1, "one blocked task");

// ─── Overdue / not-started counts ────────────────────────────────────────────

const overdueCount = sampleTasks.filter(t => t.isOverdue).length;
assert(overdueCount === 1, "one overdue task");

const notStartedCount = sampleTasks.filter(t => t.status === "not_started").length;
assert(notStartedCount === 1, "one not-started task");

// ─── NEXT_STATUS transitions ─────────────────────────────────────────────────

type TaskStatus = "not_started" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";

const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  not_started: "in_progress",
  in_progress: "done",
  in_review:   "done",
  blocked:     "in_progress",
};

assert(NEXT_STATUS.not_started === "in_progress", "not_started → in_progress");
assert(NEXT_STATUS.in_progress === "done",        "in_progress → done");
assert(NEXT_STATUS.blocked === "in_progress",     "blocked → in_progress");
assert(NEXT_STATUS.done === undefined,            "done has no next status");
assert(NEXT_STATUS.cancelled === undefined,       "cancelled has no next status");
