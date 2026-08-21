/**
 * 经营事项的可见性口径（V15/P1：数据级权限收敛）。
 *
 * ## 从「同部门」收敛到「显式协作人」
 *
 * 旧口径是 `ownerId === 自己 || 事项.department === 自己的部门名`。
 * 它有两个毛病：范围过宽（财务部任何人看得到财务部每一条事项，包括薪酬、
 * 补偿这类敏感的），以及靠**部门名称字符串**比对——改个部门名，可见性就悄悄变了。
 *
 * 新口径：owner ∪ 显式协作人 ∪ 公司级角色。协作关系落在 `event_collaborators`，
 * 存量由迁移 097 一次性固化，之后必须有人显式添加。
 *
 * ## 可见 ≠ 可改
 *
 * 这里只管看得见什么。能不能改由 `access/ownership.ts` 的 `canMutate` 判定，
 * 协作人**不因为看得见就能改**——那正是职责分离要防的。
 */

/** 能看到公司全部事项的角色。 */
const COMPANY_WIDE_ROLES = ["role-chairman", "role-finance-director"] as const;

export function hasCompanyWideEventAccess(roleCodes: readonly string[]): boolean {
  return roleCodes.some((role) => (COMPANY_WIDE_ROLES as readonly string[]).includes(role));
}

export interface EventVisibilityActor {
  userId: string;
  roleCodes: readonly string[];
}

interface EventLike {
  id: string;
  ownerId?: string | null;
}

/**
 * 这个人能不能看到这条事项。
 *
 * `collaboratingEventIds` 是该用户参与协作的事项 id 集合，由调用方一次查出来——
 * 逐条去查会在列表页变成 N 次查询。
 */
export function canViewEvent(
  event: EventLike,
  actor: EventVisibilityActor,
  collaboratingEventIds: ReadonlySet<string>
): boolean {
  if (hasCompanyWideEventAccess(actor.roleCodes)) return true;
  // 无主事项对普通成员不可见：谁都能看的「没人负责的事项」是收敛前那个口径的
  // 另一种形态。公司级角色仍然看得到（上面已返回），不会没人管。
  if (event.ownerId && event.ownerId === actor.userId) return true;
  return collaboratingEventIds.has(event.id);
}

/** 批量过滤。顺序保持不变——调用方依赖列表原有排序。 */
export function filterVisibleEvents<T extends EventLike>(
  events: readonly T[],
  actor: EventVisibilityActor,
  collaboratingEventIds: ReadonlySet<string>
): T[] {
  if (hasCompanyWideEventAccess(actor.roleCodes)) return [...events];
  return events.filter((event) => canViewEvent(event, actor, collaboratingEventIds));
}
