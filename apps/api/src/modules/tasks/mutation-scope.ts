/**
 * 任务的归属收敛。
 *
 * ## V15/P1：实现搬到了通用层
 *
 * 一个月回顾的「发现三」说这里「是打补丁而非机制」。现在判定逻辑在
 * `modules/access/ownership.ts`，任务、事项、报销、合同共用同一份——
 * 本文件只保留任务专用的类型与一层薄包装，让既有调用点不用改。
 *
 * 判定本身没变：持 `tasks.manage` 的可改任意任务，其余只能改自己名下的；
 * 无主任务对非管理者一律拒绝。
 */

import { canMutate, type OwnershipActor } from "../access/ownership.js";

export interface TaskOwnership {
  ownerId: string | null;
}

export type TaskMutationActor = OwnershipActor;

/**
 * 判断这个人能否改这条任务。
 *
 * 刻意**不**沿用 `scopeTasks` 的「owner 或同部门」口径：那是可见性口径，
 * 读得到不等于改得动。同部门任意人能改彼此的任务，在职责分离上说不过去。
 */
export function canMutateTask(task: TaskOwnership, actor: TaskMutationActor): boolean {
  return canMutate("task", task.ownerId, actor);
}
