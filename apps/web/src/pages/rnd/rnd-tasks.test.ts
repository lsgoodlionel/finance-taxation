import type { RndProjectSummary } from "@finance-taxation/domain-model";
import {
  DEFAULT_RND_TASK,
  RND_PROJECT_QUERY_KEY,
  RND_STATUS_PRESENTATION,
  RND_TASK_KEYS,
  RND_TASK_QUERY_KEY,
  SUPER_DEDUCTION_EXTRA_MULTIPLE,
  SUPER_DEDUCTION_TOTAL_MULTIPLE,
  buildRndProjectFlow,
  buildRndTasks,
  computeEligibleBase,
  computeExtraDeduction,
  countProjectsWithoutCosts,
  hasCollectedCosts,
  isRndTaskKey,
  parseAmount,
  readRndProjectId,
  readRndTask,
  summarizeRndFlow,
  writeRndProjectId,
  writeRndTask
} from "./rnd-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSummary(overrides: Partial<RndProjectSummary> = {}): RndProjectSummary {
  return {
    projectId: "rnd-1",
    expenseAmount: "0",
    capitalizedAmount: "0",
    totalHours: "0",
    superDeductionEligibleBase: "0",
    ...overrides
  };
}

// ── 任务划分：三件事，顺序固定 ───────────────────────────────────────────────

{
  const tasks = buildRndTasks([]);
  assert(tasks.length === 3, `expected 3 R&D tasks, got ${tasks.length}`);
  assert(
    tasks.map((task) => task.key).join(",") === "projects,costs,deduction",
    "expected 挑项目 → 归集费用 → 核对加计扣除 order"
  );
  assert(
    tasks.every((task) => Boolean(task.label) && Boolean(task.description)),
    "expected every R&D task to carry a label and a description"
  );
  // 「归集费用」必须说清费用化/资本化的区别——它直接决定能不能加计扣除。
  const costs = tasks.find((task) => task.key === RND_TASK_KEYS.costs);
  assert(costs?.description?.includes("资本化") === true, "expected the cost task to explain capitalization");
}

// ── 角标：只有「还没归集费用的项目数」是真待办 ───────────────────────────────

{
  const tasks = buildRndTasks([]);
  assert(
    tasks.filter((task) => typeof task.badge === "number").length === 1,
    "expected exactly one badged R&D task"
  );
  assert(
    tasks.find((task) => task.key === RND_TASK_KEYS.costs)?.badge === 0,
    "expected the badge to sit on the cost-collection task"
  );
}

{
  const projects = [
    { status: "active" as const, summary: makeSummary() },
    { status: "planning" as const, summary: makeSummary() },
    { status: "active" as const, summary: makeSummary({ expenseAmount: "1000" }) },
    // 只归集了资本化的也算归集过 —— 归集动作发生了，只是不进基数。
    { status: "active" as const, summary: makeSummary({ capitalizedAmount: "500" }) },
    // 已结项的项目没归集费用是既成事实，不该挂进永远消不掉的红角标。
    { status: "closed" as const, summary: makeSummary() }
  ];

  assert(countProjectsWithoutCosts(projects) === 2, "expected only open projects without costs to be counted");
  assert(
    buildRndTasks(projects).find((task) => task.key === RND_TASK_KEYS.costs)?.badge === 2,
    "expected the badge to match countProjectsWithoutCosts"
  );
  assert(hasCollectedCosts(makeSummary({ capitalizedAmount: "500" })), "capitalized-only still counts as collected");
  assert(!hasCollectedCosts(makeSummary()), "an all-zero summary has not collected anything");
}

// ── URL 同步：任务与选中的项目互不干扰 ───────────────────────────────────────

{
  assert(readRndTask(new URLSearchParams()) === DEFAULT_RND_TASK, "expected the default R&D task");
  assert(readRndTask(new URLSearchParams(`${RND_TASK_QUERY_KEY}=deduction`)) === "deduction", "expected ?task= to win");
  assert(
    readRndTask(new URLSearchParams(`${RND_TASK_QUERY_KEY}=nope`)) === DEFAULT_RND_TASK,
    "expected an unknown task key to fall back to the default"
  );
  assert(isRndTaskKey("costs") && !isRndTaskKey("costs-x"), "expected isRndTaskKey to be exact");

  // 切换任务不能把选中的项目弄丢 —— 两个参数各管各的。
  const withProject = new URLSearchParams(`${RND_PROJECT_QUERY_KEY}=rnd-9&keep=1`);
  const switched = writeRndTask(withProject, "deduction");
  assert(switched.get(RND_TASK_QUERY_KEY) === "deduction", "expected the task to be written");
  assert(switched.get(RND_PROJECT_QUERY_KEY) === "rnd-9", "expected the selected project to survive a task switch");
  assert(switched.get("keep") === "1", "expected unrelated params to survive");

  const withTask = new URLSearchParams(`${RND_TASK_QUERY_KEY}=costs`);
  const picked = writeRndProjectId(withTask, "rnd-7");
  assert(picked.get(RND_PROJECT_QUERY_KEY) === "rnd-7", "expected the project to be written");
  assert(picked.get(RND_TASK_QUERY_KEY) === "costs", "expected the task to survive a project switch");
  assert(readRndProjectId(picked) === "rnd-7", "expected project read/write to round-trip");
  assert(readRndProjectId(writeRndProjectId(picked, null)) === null, "expected a null project to clear the param");
  assert(readRndProjectId(new URLSearchParams(`${RND_PROJECT_QUERY_KEY}=`)) === null, "expected a blank project id to read as null");

  // 写入不可变：不得就地改调用方传进来的 URLSearchParams。
  const original = new URLSearchParams(`${RND_TASK_QUERY_KEY}=projects`);
  writeRndTask(original, "deduction");
  writeRndProjectId(original, "rnd-1");
  assert(original.get(RND_TASK_QUERY_KEY) === "projects", "expected writeRndTask to not mutate its input");
  assert(original.get(RND_PROJECT_QUERY_KEY) === null, "expected writeRndProjectId to not mutate its input");
}

// ── 口径：加计扣除基数只认费用化，且不再乘 0.75 ─────────────────────────────

{
  // 后端 modules/rnd/summary.ts: superDeductionEligibleBase = 费用化金额。
  // 改造前向导算的是 费用化 + 资本化 × 0.60，这条断言就是防止它回来。
  const entries = [
    { accountingTreatment: "expensed", amount: "50000" },
    { accountingTreatment: "expensed", amount: "30000" },
    { accountingTreatment: "capitalized", amount: "20000" }
  ];
  assert(computeEligibleBase(entries) === 80000, "eligible base must be expensed-only, with no capitalized share");
  assert(computeEligibleBase([]) === 0, "an empty collection yields a zero base");
  assert(
    computeEligibleBase([{ accountingTreatment: "capitalized", amount: "999" }]) === 0,
    "capitalized-only collection must not produce a deduction base"
  );

  // 后端 modules/rnd/package.ts: suggestedDeductionAmount = 基数 × 2（据实 1 + 加计 1）。
  assert(SUPER_DEDUCTION_TOTAL_MULTIPLE === 2, "total deductible must stay aligned with the backend package");
  assert(SUPER_DEDUCTION_EXTRA_MULTIPLE === 1, "the extra (加计) portion must be 100% of the base");
  assert(computeExtraDeduction(80000) === 80000, "extra deduction equals the base under 100% super-deduction");
  assert(computeExtraDeduction(0) === 0, "a zero base yields a zero deduction");
  // 旧的 0.75 口径必须不再成立。
  assert(computeExtraDeduction(100000) !== 75000, "the stale 75% rate must not come back");

  assert(parseAmount("12.5") === 12.5, "parseAmount reads decimals");
  assert(parseAmount("") === 0 && parseAmount(null) === 0 && parseAmount("abc") === 0, "parseAmount never yields NaN");
}

// ── 项目状态：与领域模型的三个取值对齐，不再漏 closed ────────────────────────

{
  const keys = Object.keys(RND_STATUS_PRESENTATION).sort().join(",");
  assert(keys === "active,closed,planning", `expected the domain's three statuses, got ${keys}`);
  assert(RND_STATUS_PRESENTATION.closed.label === "已结项", "closed must render Chinese, not the raw enum value");
}

// ── 「这个项目走到哪了」：每一步都指得到一个真字段 ───────────────────────────

{
  // 只画三步。工时 / 申报 / 转资 / 结项都不在里面，理由见 rnd-tasks.ts 的注释。
  const flow = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: null,
    summary: makeSummary()
  });
  assert(flow.steps.length === 3, `expected exactly 3 flow steps, got ${flow.steps.length}`);
  assert(
    flow.steps.map((step) => step.key).join(",") === "established,costs,base",
    "expected 立项 → 归集费用 → 形成基数"
  );
  // 工时没有支撑基数计算的因果关系（后端基数 = 费用化金额），不得被画成流程步骤。
  assert(
    !flow.steps.some((step) => step.label.includes("工时")),
    "hours must not be drawn as a flow step: the backend base does not depend on them"
  );
  // 「申报 / 汇算」在任何字段里都没有状态记录，不得出现。
  assert(
    !flow.steps.some((step) => step.label.includes("申报") || step.label.includes("汇算")),
    "filing must not be drawn: no field records whether the package was filed"
  );
}

{
  // 立项完成、费用未归集 → 当前步骤是「归集研发费用」。
  const flow = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: null,
    costLineCount: 0,
    summary: makeSummary(),
    conflicts: []
  });
  assert(flow.steps[0]?.status === "done", "立项 should be done once startedOn exists");
  assert(flow.steps[1]?.status === "current", "归集费用 should be the current step");
  assert(flow.steps[2]?.status === "pending", "基数 should not be actionable before costs exist");
  assert(flow.nextStepKey === "costs", "expected the next actionable step to be cost collection");
  assert(summarizeRndFlow(flow).text === "待办：归集研发费用", "list cell should name the current step");
}

{
  // 全部走完。
  const flow = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: null,
    costLineCount: 3,
    summary: makeSummary({ expenseAmount: "1000", superDeductionEligibleBase: "1000" }),
    conflicts: []
  });
  assert(flow.overall === "done", "expected a fully collected project to be done");
  assert(summarizeRndFlow(flow).tone === "done", "expected the done tone");
}

{
  // 有政策冲突 → 基数算得出来也不能用，第三步显示为「卡住了」。
  const flow = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: null,
    costLineCount: 2,
    summary: makeSummary({ expenseAmount: "1000", superDeductionEligibleBase: "1000" }),
    conflicts: ["资本化政策与实际归集不一致"]
  });
  assert(flow.overall === "blocked", "policy conflicts must block the base step even when the number exists");
  assert(flow.steps[2]?.status === "blocked", "the base step carries the block");
  assert(
    flow.steps[2]?.hint === "资本化政策与实际归集不一致",
    "the block reason must be the real policyReview.conflicts text"
  );
  assert(summarizeRndFlow(flow).text.startsWith("卡住"), "the list cell must surface the block");
}

// ── 对象级链接：只在字段真的存在时才画 ───────────────────────────────────────

{
  const linked = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: "evt-1",
    summary: makeSummary()
  });
  const related = linked.steps[0]?.related ?? [];
  assert(related.length === 1, "expected the 立项 step to link its business event");
  assert(related[0]?.kind === "business_event" && related[0]?.id === "evt-1", "expected a real business_event link");

  // businessEventId 可空；为空时绝不能造一个假链接出来。
  const unlinked = buildRndProjectFlow({
    startedOn: "2026-01-01",
    businessEventId: null,
    summary: makeSummary()
  });
  assert((unlinked.steps[0]?.related ?? []).length === 0, "a null businessEventId must produce no link");

  // 费用行在 Web 端的类型契约里没有 voucherId（lib/api.ts 把 costLines 收窄了），
  // 所以任何一步都不得出现凭证链接。
  const allRelated = linked.steps.flatMap((step) => step.related ?? []);
  assert(
    !allRelated.some((object) => object.kind === "voucher"),
    "cost lines expose no voucherId to the web type contract, so no voucher link may be drawn"
  );
}

console.log("rnd-tasks-ok");
