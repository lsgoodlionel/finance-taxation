/**
 * 数据级归属收敛（P1）。
 *
 * ## 路由权限与数据归属是两个问题
 *
 * 路由权限回答「**谁能进这个门**」——`PUT /api/tasks/:id` 挂在
 * `anyOf(tasks.view, tasks.manage)` 上，基层角色才改得了自己名下的任务。
 *
 * 数据归属回答「**进来之后能碰谁的东西**」。一个月回顾的「发现三」说：
 * 这一层「几乎没有约束……目前只有任务模块做了一处归属收敛，是打补丁而非机制」。
 *
 * 这个文件就是把那处补丁抽成机制。
 *
 * ## 为什么不做成「同部门可见即可改」
 *
 * `scopeTasks` 那种「owner 或同部门」是**可见性**口径——读得到不等于改得动。
 * 同部门任意人能改彼此的报销单，在职责分离上说不过去：
 * 报销单是「谁花的钱谁报」，改别人的报销等于替他签字。
 *
 * ## 管理权限是唯一的越过通道
 *
 * 持 `*.manage` 的角色（财务负责人、董事长）可以碰全公司的数据——
 * 那是他们的职责。**但仍然受职责分离约束**：凭证的复核人 ≠ 过账人
 * 这类规则在各自模块里判，不走这一层。
 */

import { hasPermission } from "../../middleware/auth.js";
import type { PermissionKey } from "@finance-taxation/domain-model";

export interface OwnershipActor {
  userId: string;
  roleCodes: string[];
}

export interface OwnershipRule {
  /**
   * 持有它就能碰全公司的数据。
   *
   * 传 `null` 表示**没有越过通道**——那种资源只有归属人自己能改，
   * 管理者也不行（目前没有这样的资源，留这个口子是为了不把话说死）。
   */
  managePermission: PermissionKey | null;
}

/**
 * 这个人能不能改这条记录。
 *
 * `ownerId` 可空（多数表的归属字段允许 NULL）。**无主记录对非管理者一律拒绝**，
 * 而不是因为「两边都是空」就放行——`null === null` 在 JS 里是 true，
 * 那种写法会让所有无主记录对所有人开放。
 */
export function canMutateOwned(
  ownerId: string | null | undefined,
  actor: OwnershipActor,
  rule: OwnershipRule
): boolean {
  if (rule.managePermission !== null && hasPermission(actor.roleCodes, rule.managePermission)) {
    return true;
  }
  if (!ownerId || !actor.userId) {
    return false;
  }
  return ownerId === actor.userId;
}

/**
 * 各业务对象的归属规则。
 *
 * **归属字段名各表不同**（`owner_id` / `applicant_user_id` /
 * `created_by_user_id`），所以这里同时记字段名——调用方从这里取，
 * 不各自硬编码。写错字段名的表现是「谁都改不了」或「谁都能改」，
 * 两者都不会报错。
 */
export const OWNERSHIP_RULES = {
  task: { column: "owner_id", managePermission: "tasks.manage" },
  businessEvent: { column: "owner_id", managePermission: "events.assign" },
  reimbursement: { column: "applicant_user_id", managePermission: "expense.manage" },
  contract: { column: "created_by_user_id", managePermission: "contracts.manage" }
} as const satisfies Record<string, { column: string; managePermission: PermissionKey }>;

export type OwnedResource = keyof typeof OWNERSHIP_RULES;

/** 按资源类型判定。调用方只需说「这是哪种资源」，规则从上面的表里取。 */
export function canMutate(
  resource: OwnedResource,
  ownerId: string | null | undefined,
  actor: OwnershipActor
): boolean {
  return canMutateOwned(ownerId, actor, OWNERSHIP_RULES[resource]);
}

/**
 * 读取范围的 SQL 片段：**列出来的东西该看到哪些**。
 *
 * 与「能不能改」分开：可见性可以宽于可改性（同部门看得到、只有本人改得动），
 * 而把两者合成一个判断会逼着二选一——要么同部门改得动（越权），
 * 要么同部门看不到（协作不了）。
 *
 * 返回 `null` 表示不加限制（管理者）。
 */
export function ownershipFilter(
  resource: OwnedResource,
  actor: OwnershipActor,
  paramIndex: number
): { clause: string; param: string } | null {
  const rule = OWNERSHIP_RULES[resource];
  if (hasPermission(actor.roleCodes, rule.managePermission)) return null;
  return { clause: `${rule.column} = $${paramIndex}`, param: actor.userId };
}
