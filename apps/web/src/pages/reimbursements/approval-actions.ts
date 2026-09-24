/**
 * 报销单审批入口的显示判定（V16）。
 *
 * 抽成纯函数而不是写在表格的 render 里：「谁该看到审批按钮」是一条业务判断，
 * 它不该随表格改版一起失去测试覆盖。
 *
 * **这不是权限边界。** 服务端每次 transition 都会独立校验
 * （`expense.manage` + 审批人 ≠ 申请人）。这里只负责不给用户看必然点不动的按钮。
 */

export interface ApprovalActor {
  userId: string;
  /**
   * 这个人持有的权限键，来自 `/api/access/me`。
   *
   * **不要在前端按角色自己推**——那等于把后端的权限表复制一份，
   * 两份迟早漂移，而漂移的方向通常是把不该显示的按钮显示出来。
   */
  permissions?: readonly string[];
}

export interface ApprovableDocument {
  status: string;
  applicantUserId: string;
}

export function canShowApprovalActions(
  document: ApprovableDocument,
  actor: ApprovalActor
): boolean {
  // 只有待审批的单据等着人批。
  if (document.status !== "pending") return false;

  // 权限未知（接口还没回、或旧后端不带这个字段）时按「没有」处理：
  // 宁可少显示一个按钮，也不要显示一个点下去弹 403 的。
  if (!actor.permissions?.includes("expense.manage")) return false;

  // 内控底线：任何角色都不能审批自己提交的单据。
  return document.applicantUserId !== actor.userId;
}
