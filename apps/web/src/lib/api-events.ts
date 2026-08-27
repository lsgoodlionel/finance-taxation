/**
 * 经营事项的协作人接口（V15/P1）。
 *
 * 单独一个文件而不是塞进 `lib/api.ts`——那个文件已经 2400 多行，
 * 是 P2 明确要拆的目标之一，往里加新东西只会让它更难拆。
 */
import { request } from "./api";

export interface EventCollaborator {
  userId: string;
  displayName: string;
  /** `migrated` = 升级时从原「同部门可见」范围固化而来；`manual` = 有人显式加的。 */
  source: string;
  addedByUserId: string | null;
  createdAt: string;
}

export async function listEventCollaborators(businessEventId: string) {
  return request<{ items: EventCollaborator[] }>(
    `/api/events/${encodeURIComponent(businessEventId)}/collaborators`
  );
}

export async function addEventCollaborator(businessEventId: string, userId: string) {
  return request<{ items: EventCollaborator[] }>(
    `/api/events/${encodeURIComponent(businessEventId)}/collaborators`,
    { method: "POST", body: JSON.stringify({ userId }) }
  );
}

export async function removeEventCollaborator(businessEventId: string, userId: string) {
  return request<{ items: EventCollaborator[] }>(
    `/api/events/${encodeURIComponent(businessEventId)}/collaborators/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

export interface CompanyMember {
  id: string;
  username: string;
  displayName: string;
  roleIds: string[];
}

/**
 * 公司成员名单。
 *
 * 传 `permission` 可以只要**持有某项权限**的人，例如挑凭证过账的终审人时传
 * `ledger.post`。过滤在服务端做——「哪个角色有哪项权限」的事实来源在后端的
 * 权限表里，前端自己按 roleId 判断等于把那张表复制一份，两份迟早漂移。
 */
export async function listCompanyMembers(permission?: string) {
  const suffix = permission ? `?permission=${encodeURIComponent(permission)}` : "";
  return request<{ items: CompanyMember[]; total: number }>(`/api/settings/users${suffix}`);
}
