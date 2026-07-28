/**
 * 「这个任务走到哪了」的纯推导（V10 车道 G1）。
 *
 * 先说为什么只画三步，以及为什么没画清单项——上一轮 /risk 的教训是
 * 「数据撑不起就不要画，宁可不做也不硬编码」，这里逐条核过：
 *
 * - `TaskChecklistItem` 存在于领域模型，但 apps/web 的 lib/api.ts 根本没有拉取它的
 *   接口（全仓只有月结的 close checklist）。前端拿不到，就不能拿它凑步骤。
 * - `Task.status` 有六个值，但 not_started → in_progress → done 才是必经路径：
 *   in_review 是可选的（TaskDrawer 的 NEXT_STATUS 里 in_progress 直接到 done），
 *   把「复核」画成固定的第四步，会让绝大多数根本不走复核的任务永远显示一步
 *   pending——那是假的进度。所以 in_review 归入「处理完成」，与看板的列映射
 *   （TaskKanbanView 把 in_review 并进「进行中」列）保持同一口径。
 * - blocked 不是一个阶段而是当前这步的状态，因此作为 blockedReason 表达。
 * - cancelled 的任务没有「走到哪了」可言，返回 null，由调用方改用一句说明。
 *
 * 真正的增量信息在于：卡住的原因（被标记阻塞 / 子任务没做完）、这一步归谁办
 * （责任部门）、以及沿途可跳转的关联对象（经营事项、父任务、子任务）——
 * 这些都是既有 UI 里看不到或点不动的。
 */
import type { Task } from "@finance-taxation/domain-model";
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";

/** 流程条里最多挂几个子任务链接：再多就把一行细排步骤挤成一堵墙。 */
const MAX_RELATED_SUBTASKS = 6;

const OPEN_SUBTASK_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "not_started",
  "in_progress",
  "in_review",
  "blocked"
]);

export interface TaskFlowInput {
  task: Pick<Task, "id" | "status" | "businessEventId" | "parentTaskId" | "assigneeDepartment"> | null;
  /** 当前页已加载的全部任务，用于找父任务与子任务。 */
  allTasks: readonly Pick<Task, "id" | "title" | "status" | "parentTaskId">[];
}

/** 未完成的直接子任务（已完成/已取消的不算）。 */
export function selectOpenSubtasks(
  taskId: string,
  allTasks: readonly Pick<Task, "id" | "title" | "status" | "parentTaskId">[]
): Pick<Task, "id" | "title" | "status" | "parentTaskId">[] {
  return allTasks.filter(
    (candidate) => candidate.parentTaskId === taskId && OPEN_SUBTASK_STATUSES.has(candidate.status)
  );
}

/**
 * 这个任务牵扯到的可跳转对象：关联事项、父任务、未完成的子任务。
 * 供 RelatedObjectsPanel 直接消费（EntityLink 的 task 走 resourceType/resourceId，
 * TasksPage 会据此打开对应任务的详情）。
 */
export function buildTaskRelatedObjects({ task, allTasks }: TaskFlowInput): FlowRelatedObject[] {
  if (!task) {
    return [];
  }
  const related: FlowRelatedObject[] = [];

  if (task.businessEventId) {
    related.push({ kind: "business_event", id: task.businessEventId, label: task.businessEventId });
  }
  if (task.parentTaskId) {
    const parent = allTasks.find((candidate) => candidate.id === task.parentTaskId);
    related.push({ kind: "task", id: task.parentTaskId, label: parent?.title ?? task.parentTaskId });
  }
  for (const subtask of selectOpenSubtasks(task.id, allTasks)) {
    related.push({ kind: "task", id: subtask.id, label: subtask.title });
  }

  return related;
}

function resolveExecuteBlockedReason(
  status: Task["status"],
  openSubtaskCount: number
): string | null {
  if (status === "blocked") {
    return "任务被标记为阻塞，先解决卡点或回到上游补齐资料，再继续推进";
  }
  if (openSubtaskCount > 0) {
    return `还有 ${openSubtaskCount} 个子任务没做完，先把子任务推完再收口`;
  }
  return null;
}

/**
 * 由任务真实字段推导流程视图。
 * 没有选中任务、或任务已取消时返回 null（不画空条，也不画假进度）。
 */
export function buildTaskFlow({ task, allTasks }: TaskFlowInput): ObjectFlow | null {
  if (!task || task.status === "cancelled") {
    return null;
  }

  const owner = task.assigneeDepartment || undefined;
  const openSubtasks = selectOpenSubtasks(task.id, allTasks);
  const eventLinks: FlowRelatedObject[] = task.businessEventId
    ? [{ kind: "business_event", id: task.businessEventId, label: task.businessEventId }]
    : [];
  const subtaskLinks: FlowRelatedObject[] = openSubtasks
    .slice(0, MAX_RELATED_SUBTASKS)
    .map((subtask) => ({ kind: "task" as const, id: subtask.id, label: subtask.title }));

  return buildObjectFlow([
    {
      key: "start",
      label: "接手开工",
      done: task.status !== "not_started",
      related: eventLinks,
      owner
    },
    {
      key: "execute",
      label: "把事情做完",
      done: task.status === "in_review" || task.status === "done",
      blockedReason: resolveExecuteBlockedReason(task.status, openSubtasks.length),
      related: subtaskLinks,
      owner
    },
    {
      key: "close",
      label: "确认并关闭",
      done: task.status === "done",
      owner
    }
  ]);
}

/** 流程条标题：带上任务本身，避免和全站的环节导航条混淆。 */
export function buildTaskFlowTitle(title: string | null | undefined): string {
  return title ? `这个任务办到哪了 · ${title}` : "这个任务办到哪了";
}
