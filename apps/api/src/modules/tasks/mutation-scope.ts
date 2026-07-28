import { hasPermission } from "../../middleware/auth.js";

export interface TaskOwnership {
  ownerId: string | null;
}

export interface TaskMutationActor {
  userId: string;
  roleCodes: string[];
}

/**
 * 判断这个人能否改这条任务。
 *
 * 路由权限只回答「谁能进这个门」：`PUT /api/tasks/:id` 放到
 * `anyOf(tasks.view, tasks.manage)`，基层角色才改得了自己名下的任务。
 * 进门之后由本函数回答「能碰谁的东西」。
 *
 * - 持 `tasks.manage`（董事长、财务负责人）：可改公司内任意任务。
 * - 其余角色：只能改自己是负责人的任务。
 *
 * 刻意**不**沿用 `scopeTasks` 的「owner 或同部门」口径：那是可见性口径，
 * 读得到不等于改得动。同部门任意人能改彼此的任务，在职责分离上说不过去。
 *
 * `ownerId` 可空（`tasks.owner_id` 允许 NULL）。无主任务对非管理者一律拒绝，
 * 而不是因为「两边都是空」就放行。
 */
export function canMutateTask(task: TaskOwnership, actor: TaskMutationActor): boolean {
  if (hasPermission(actor.roleCodes, "tasks.manage")) {
    return true;
  }
  if (!task.ownerId || !actor.userId) {
    return false;
  }
  return task.ownerId === actor.userId;
}
