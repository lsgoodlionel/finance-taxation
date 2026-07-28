/**
 * V10「这一笔的流程」纯逻辑。
 *
 * 与 components/FinanceFlowBar 的区别（这是本轮最关键的一条）：
 *   FinanceFlowBar 讲的是「系统有哪 10 个环节」——它按当前页在数组里的下标算
 *   done/current，与任何业务数据无关，本质是一条导航条；
 *   本模块讲的是「我手上这一笔走到哪了、卡在哪、下一步谁做什么」——每一步的
 *   状态来自该对象的真实字段，并携带可跳转的关联对象。
 *
 * 借鉴 /close 的 ClosePlanView 模式（后端算 steps + nextActionableStep +
 * blockingReason，前一步未完成则后续 blocked），把它推广到单个业务对象。
 */
import type { EntityKind } from "../components/ui/EntityLink";

export type FlowStepStatus = "done" | "current" | "blocked" | "pending";

export interface FlowRelatedObject {
  kind: EntityKind;
  id: string;
  label?: string;
}

export interface ObjectFlowStep {
  key: string;
  /** 面向用户的步骤名，白话优先（如「记进账本」而不是「过账」）。 */
  label: string;
  status: FlowStepStatus;
  /** 这一步产生/关联的对象，用于「看到即可达」。 */
  related?: readonly FlowRelatedObject[];
  /** 当前这步在等什么（仅 current/blocked 时有意义）。 */
  hint?: string;
  /** 谁来做——让用户知道该不该自己动手。 */
  owner?: string;
}

export interface ObjectFlow {
  steps: readonly ObjectFlowStep[];
  /** 下一个可执行的步骤 key；全部完成时为 null。 */
  nextStepKey: string | null;
  /** 整体状态：done=全流程走完 */
  overall: "in_progress" | "done" | "blocked";
}

interface StepInput {
  key: string;
  label: string;
  /** 该步是否已完成（由调用方按真实字段判定）。 */
  done: boolean;
  /** 该步是否被外部条件挡住（如缺资料）。 */
  blockedReason?: string | null;
  related?: readonly FlowRelatedObject[];
  owner?: string;
}

/**
 * 由「按顺序的步骤完成情况」推导出流程视图。
 *
 * 规则（与 ClosePlanBoard 一致）：
 * - 第一个未完成的步骤是 current；
 * - current 之后的步骤一律 pending（前置未完成，不该让用户在那里动手）；
 * - 若 current 步骤带 blockedReason，则它是 blocked，整体也是 blocked。
 */
export function buildObjectFlow(steps: readonly StepInput[]): ObjectFlow {
  if (steps.length === 0) {
    return { steps: [], nextStepKey: null, overall: "done" };
  }

  const firstUnfinished = steps.findIndex((step) => !step.done);
  if (firstUnfinished === -1) {
    return {
      steps: steps.map((step) => ({
        key: step.key,
        label: step.label,
        status: "done" as const,
        related: step.related,
        owner: step.owner
      })),
      nextStepKey: null,
      overall: "done"
    };
  }

  const currentBlocked = steps[firstUnfinished]?.blockedReason ?? null;

  const resolved = steps.map((step, index): ObjectFlowStep => {
    if (index < firstUnfinished) {
      return { key: step.key, label: step.label, status: "done", related: step.related, owner: step.owner };
    }
    if (index === firstUnfinished) {
      return {
        key: step.key,
        label: step.label,
        status: currentBlocked ? "blocked" : "current",
        related: step.related,
        hint: currentBlocked ?? undefined,
        owner: step.owner
      };
    }
    return { key: step.key, label: step.label, status: "pending", related: step.related, owner: step.owner };
  });

  return {
    steps: resolved,
    nextStepKey: steps[firstUnfinished]?.key ?? null,
    overall: currentBlocked ? "blocked" : "in_progress"
  };
}

/** 取出流程里所有可跳转的关联对象（去重，保序）。 */
export function collectRelatedObjects(flow: ObjectFlow): FlowRelatedObject[] {
  const seen = new Set<string>();
  const result: FlowRelatedObject[] = [];
  for (const step of flow.steps) {
    for (const related of step.related ?? []) {
      const dedupeKey = `${related.kind}:${related.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(related);
    }
  }
  return result;
}
