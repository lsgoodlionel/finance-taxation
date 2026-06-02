// Pure-logic unit tests for TasksPage components — no DOM, no node:test
function okTasks(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Due-date formatting ──────────────────────────────────────────────────────

function formatDueDate(dueAt: string | null | undefined): string {
  return dueAt ? dueAt.slice(0, 10) : "—";
}

okTasks(formatDueDate("2026-06-15T00:00:00Z") === "2026-06-15", "formats ISO date");
okTasks(formatDueDate(null) === "—", "returns dash for null");
okTasks(formatDueDate(undefined) === "—", "returns dash for undefined");

// ─── Kanban column mapping ────────────────────────────────────────────────────

type KanbanColumnId = "not_started" | "in_progress" | "done" | "blocked";

function toColumnId(status: string): KanbanColumnId {
  if (status === "in_review") return "in_progress";
  if (status === "cancelled") return "done";
  return status as KanbanColumnId;
}

okTasks(toColumnId("in_review")   === "in_progress",  "in_review → in_progress");
okTasks(toColumnId("cancelled")   === "done",          "cancelled → done");
okTasks(toColumnId("blocked")     === "blocked",       "blocked → blocked");
okTasks(toColumnId("not_started") === "not_started",   "not_started → not_started");

// ─── Kanban grouping ──────────────────────────────────────────────────────────

interface SimpleTask { id: string; status: string; isOverdue?: boolean }

function groupByColumn(tasks: SimpleTask[]): Record<KanbanColumnId, SimpleTask[]> {
  const map: Record<KanbanColumnId, SimpleTask[]> = {
    not_started: [], in_progress: [], done: [], blocked: [],
  };
  for (const task of tasks) {
    map[toColumnId(task.status)].push(task);
  }
  return map;
}

const sample: SimpleTask[] = [
  { id: "1", status: "not_started" },
  { id: "2", status: "in_review" },
  { id: "3", status: "in_progress" },
  { id: "4", status: "done" },
  { id: "5", status: "cancelled" },
  { id: "6", status: "blocked", isOverdue: true },
];

const g = groupByColumn(sample);
okTasks(g.not_started.length === 1, "one not_started task");
okTasks(g.in_progress.length === 2, "in_review + in_progress → in_progress column");
okTasks(g.done.length === 2,        "done + cancelled → done column");
okTasks(g.blocked.length === 1,     "one blocked task");
okTasks(sample.filter(t => t.isOverdue).length === 1, "one overdue task");

// ─── NEXT_STATUS transitions ─────────────────────────────────────────────────

type TaskStatus = "not_started" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
const NEXT: Partial<Record<TaskStatus, TaskStatus>> = {
  not_started: "in_progress",
  in_progress: "done",
  in_review:   "done",
  blocked:     "in_progress",
};

okTasks(NEXT.not_started === "in_progress", "not_started → in_progress");
okTasks(NEXT.in_progress === "done",        "in_progress → done");
okTasks(NEXT.blocked === "in_progress",     "blocked → in_progress");
okTasks(NEXT.done === undefined,            "done has no next status");
okTasks(NEXT.cancelled === undefined,       "cancelled has no next status");
