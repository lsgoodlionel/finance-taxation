import type { Task } from "@finance-taxation/domain-model";
import { buildTaskFlow, buildTaskFlowTitle, buildTaskRelatedObjects, selectOpenSubtasks } from "./task-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

type FlowTask = Parameters<typeof buildTaskFlow>[0]["task"];
type ListTask = Parameters<typeof buildTaskFlow>[0]["allTasks"][number];

function task(partial: Partial<Task> & { id: string; status: Task["status"] }): FlowTask & ListTask {
  return {
    title: partial.id,
    businessEventId: null,
    parentTaskId: null,
    assigneeDepartment: null,
    ...partial
  } as FlowTask & ListTask;
}

function statusesOf(flow: ReturnType<typeof buildTaskFlow>): string {
  assert(flow !== null, "expected a flow");
  return flow.steps.map((step) => step.status).join(",");
}

// ── 三步来自真实 status：待开始 / 进行中 / 已完成 ─────────────────────────
const notStarted = buildTaskFlow({ task: task({ id: "t1", status: "not_started" }), allTasks: [] });
assert(statusesOf(notStarted) === "current,pending,pending", "待开始时停在第一步");

const inProgress = buildTaskFlow({ task: task({ id: "t1", status: "in_progress" }), allTasks: [] });
assert(statusesOf(inProgress) === "done,current,pending", "进行中时第一步已完成");

// in_review 归入「把事情做完」，与看板把 in_review 并进「进行中」列同一口径，
// 但流程条会推进到「确认并关闭」——球在确认方手上。
const inReview = buildTaskFlow({ task: task({ id: "t1", status: "in_review" }), allTasks: [] });
assert(statusesOf(inReview) === "done,done,current", "复核中= 已做完，等确认关闭");

const done = buildTaskFlow({ task: task({ id: "t1", status: "done" }), allTasks: [] });
assert(statusesOf(done) === "done,done,done", "已完成时三步全绿");
assert(done !== null && done.overall === "done", "整体为已办完");

// ── blocked 是当前这步的状态，不是独立阶段 ───────────────────────────────
const blocked = buildTaskFlow({ task: task({ id: "t1", status: "blocked" }), allTasks: [] });
assert(statusesOf(blocked) === "done,blocked,pending", "阻塞落在第二步");
assert(blocked !== null && blocked.overall === "blocked", "整体为卡住了");
assert(
  blocked !== null && (blocked.steps[1]?.hint ?? "").includes("阻塞"),
  "卡住的原因必须说清楚"
);

// ── 未完成的子任务是真实的前置条件 ───────────────────────────────────────
const parentWithOpenChild = buildTaskFlow({
  task: task({ id: "p1", status: "in_progress" }),
  allTasks: [
    task({ id: "p1", status: "in_progress" }),
    task({ id: "c1", status: "not_started", parentTaskId: "p1" }),
    task({ id: "c2", status: "done", parentTaskId: "p1" })
  ]
});
assert(statusesOf(parentWithOpenChild) === "done,blocked,pending", "还有子任务没做完时第二步卡住");
assert(
  parentWithOpenChild !== null && (parentWithOpenChild.steps[1]?.hint ?? "").includes("1 个子任务"),
  "提示里要给出未完成子任务数"
);
assert(
  selectOpenSubtasks("p1", [
    task({ id: "c1", status: "cancelled", parentTaskId: "p1" }),
    task({ id: "c2", status: "done", parentTaskId: "p1" })
  ]).length === 0,
  "已完成/已取消的子任务不算未完成"
);

// 已经做完的任务不该被子任务倒推成卡住（buildObjectFlow 只看第一个未完成步）
const doneParent = buildTaskFlow({
  task: task({ id: "p1", status: "done" }),
  allTasks: [task({ id: "c1", status: "not_started", parentTaskId: "p1" })]
});
assert(statusesOf(doneParent) === "done,done,done", "已完成的任务不再显示阻塞");

// ── 数据撑不起就不画 ─────────────────────────────────────────────────────
assert(buildTaskFlow({ task: null, allTasks: [] }) === null, "没有选中任务时不画流程条");
assert(
  buildTaskFlow({ task: task({ id: "t1", status: "cancelled" }), allTasks: [] }) === null,
  "已取消的任务没有「走到哪了」可言"
);

// ── 关联对象：事项 + 父任务 + 未完成子任务，且可跳转 ──────────────────────
const related = buildTaskRelatedObjects({
  task: task({ id: "c1", status: "in_progress", businessEventId: "EVT-1", parentTaskId: "p1" }),
  allTasks: [
    task({ id: "p1", status: "in_progress", title: "父任务标题" }),
    task({ id: "g1", status: "not_started", parentTaskId: "c1", title: "孙任务" }),
    task({ id: "g2", status: "done", parentTaskId: "c1" })
  ]
});
assert(related.length === 3, "事项 + 父任务 + 1 个未完成子任务");
assert(related[0]?.kind === "business_event" && related[0]?.id === "EVT-1", "第一个是关联事项");
assert(related[1]?.label === "父任务标题", "父任务用标题而不是裸 id");
assert(related[2]?.id === "g1" && related[2]?.kind === "task", "只挂未完成的子任务");
assert(buildTaskRelatedObjects({ task: null, allTasks: [] }).length === 0, "没有任务就没有关联对象");

// ── 步骤上的责任部门与关联对象来自真实字段 ───────────────────────────────
const owned = buildTaskFlow({
  task: task({ id: "t1", status: "not_started", assigneeDepartment: "财务部", businessEventId: "EVT-9" }),
  allTasks: []
});
assert(owned !== null && owned.steps[0]?.owner === "财务部", "由谁办来自 assigneeDepartment");
assert(owned !== null && owned.steps[0]?.related?.[0]?.id === "EVT-9", "第一步挂上关联事项");

assert(buildTaskFlowTitle("补充发票") === "这个任务办到哪了 · 补充发票", "标题带上任务本身");
assert(buildTaskFlowTitle(null) === "这个任务办到哪了", "没有标题时降级");

console.log("task-flow-ok");
