import type { AccountingPeriod } from "../../lib/api";
import {
  DEFAULT_LEDGER_TASK,
  LEDGER_TASK_KEYS,
  LEDGER_TASK_QUERY_KEY,
  LEGACY_LEDGER_TASK_QUERY_KEY,
  buildLedgerTasks,
  countUnlockedPeriods,
  readLedgerTask,
  writeLedgerTask
} from "./ledger-tasks";
import { LEDGER_SCENE_OPTIONS } from "./types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makePeriod(period: string, isLocked: boolean): AccountingPeriod {
  return {
    id: `period-${period}`,
    period,
    isLocked,
    lockedAt: isLocked ? "2026-06-01T00:00:00.000Z" : null,
    lockedBy: isLocked ? "user-1" : null,
    note: null,
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}

// ── 任务划分：五个场景一一对应五件事，一件不少 ────────────────────────────────

const tasks = buildLedgerTasks({ periods: [] });

assert(tasks.length === LEDGER_SCENE_OPTIONS.length, "expected one task per ledger scene");
assert(
  tasks.every((task, index) => task.key === LEDGER_SCENE_OPTIONS[index]?.key),
  "expected task order to follow the declared scene order"
);
assert(
  tasks.every((task) => Boolean(task.label) && Boolean(task.description)),
  "expected every ledger task to carry a label and a description"
);

// 「期间锁账」是月结控制，不是查账：说明文案必须把这件事讲明白。
const periodsTask = tasks.find((task) => task.key === LEDGER_TASK_KEYS.periods);
assert(periodsTask, "expected a period-lock task");
assert(
  periodsTask.description?.includes("不是查账") === true,
  "expected the period-lock task to state that it is a month-end control, not a query"
);
assert(
  tasks[tasks.length - 1]?.key === LEDGER_TASK_KEYS.periods,
  "expected the period-lock task to sit last, after the four read-only tasks"
);

// ── 角标：只有真实待办才挂 ────────────────────────────────────────────────────

assert(
  tasks.filter((task) => typeof task.badge === "number").length === 1,
  "expected only the period-lock task to carry a badge"
);

const mixedPeriods = [makePeriod("2026-04", true), makePeriod("2026-05", false), makePeriod("2026-06", false)];
assert(countUnlockedPeriods(mixedPeriods) === 2, "expected 2 unlocked periods");
assert(countUnlockedPeriods([]) === 0, "expected no unlocked periods for an empty list");

const badgedTasks = buildLedgerTasks({ periods: mixedPeriods });
assert(
  badgedTasks.find((task) => task.key === LEDGER_TASK_KEYS.periods)?.badge === 2,
  "expected the period-lock badge to count unlocked periods only"
);

// ── URL 同步：新参数优先，旧深链继续可用 ─────────────────────────────────────

assert(readLedgerTask(new URLSearchParams()) === DEFAULT_LEDGER_TASK, "expected the default task");
assert(
  readLedgerTask(new URLSearchParams(`${LEDGER_TASK_QUERY_KEY}=journal`)) === "journal",
  "expected ?task= to select the task"
);
// lib/scene-commands.ts 的「锁账」快捷指令仍指向 ?ledgerTab=periods
assert(
  readLedgerTask(new URLSearchParams(`${LEGACY_LEDGER_TASK_QUERY_KEY}=periods`)) === "periods",
  "expected the legacy ?ledgerTab= deep link to keep working"
);
assert(
  readLedgerTask(new URLSearchParams(`${LEDGER_TASK_QUERY_KEY}=entries&${LEGACY_LEDGER_TASK_QUERY_KEY}=periods`)) ===
    "entries",
  "expected the new query key to win over the legacy one"
);
assert(
  readLedgerTask(new URLSearchParams(`${LEDGER_TASK_QUERY_KEY}=not-a-task`)) === DEFAULT_LEDGER_TASK,
  "expected an unknown task key to fall back to the default"
);

const written = writeLedgerTask(new URLSearchParams(`${LEGACY_LEDGER_TASK_QUERY_KEY}=periods&keep=1`), "balances");
assert(written.get(LEDGER_TASK_QUERY_KEY) === "balances", "expected the new task to be written");
assert(written.get(LEGACY_LEDGER_TASK_QUERY_KEY) === null, "expected the legacy key to be dropped on write");
assert(written.get("keep") === "1", "expected unrelated query params to survive");
assert(readLedgerTask(written) === "balances", "expected read/write to round-trip");

// 写入不可变：不得就地改调用方传进来的 URLSearchParams
const original = new URLSearchParams(`${LEDGER_TASK_QUERY_KEY}=summary`);
writeLedgerTask(original, "periods");
assert(original.get(LEDGER_TASK_QUERY_KEY) === "summary", "expected writeLedgerTask to not mutate its input");

console.log("ledger-tasks-ok");
