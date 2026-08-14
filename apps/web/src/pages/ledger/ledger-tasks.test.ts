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
// 控制类任务（会改账、会生成凭证）必须整体排在查账类之后。
//
// 这条原来写的是「锁账必须排在最后一位」。V12-D5 加「外币调汇」时它红了——
// 而调汇同样是控制类（生成汇兑损益凭证、改变损益），排在锁账之后并不违背
// 原意。所以断言从「某一件固定在末位」改成守它真正的意图：**查账与控制之间
// 有一条分界线，控制类不许插进查账类中间**。
const CONTROL_TASK_KEYS: string[] = [LEDGER_TASK_KEYS.periods, LEDGER_TASK_KEYS.revaluation];
const firstControlIndex = tasks.findIndex((task) => CONTROL_TASK_KEYS.includes(task.key));
assert(firstControlIndex >= 0, "expected at least one month-end control task");
assert(
  tasks.slice(firstControlIndex).every((task) => CONTROL_TASK_KEYS.includes(task.key)),
  "expected every month-end control task to sit after all read-only query tasks"
);

// 调汇同样要讲明白它不是查账 —— 它会生成凭证。
const revaluationTask = tasks.find((task) => task.key === LEDGER_TASK_KEYS.revaluation);
assert(revaluationTask, "expected a currency revaluation task");
assert(
  revaluationTask.description?.includes("凭证") === true,
  "expected the revaluation task to say it generates a voucher"
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
