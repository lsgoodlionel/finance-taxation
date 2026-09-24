/**
 * 费用类单据（报销、借款）的动作权限判定（V16）。
 *
 * ## 为什么抽出来
 *
 * 报销单与借款单的状态流转接口有**完全相同的漏洞**：
 * 只由 `expense.submit` 守护（每个员工都持有），而流转函数根本不接收操作人。
 *
 * 角色实验里三个角色各自撞到了它的不同侧面：
 *   - 员工对自己 2420 元、住宿已超标的报销单发 `approve` → 200，直接生成凭证
 *   - 员工对**出纳的**报销单发 `submit` → 200，改动了别人的单据
 *   - 出纳自借、自批、自付备用金，同一个人 36 毫秒走完全流程（真实审计日志里 3 组）
 *
 * 两处各写一遍判定，迟早会漂移——而漂移的方向通常是某一边忘了拦。
 *
 * ## 判定分两类动作
 *
 * - **审批类**（approve / reject / pay）：需要 `expense.manage`，
 *   且**审批人 ≠ 单据归属人**。后者是内控底线，任何角色都绕不过去，
 *   包括董事长——不是可配置项。
 * - **本人类**（submit / cancel）：只能动自己的单，或者有管理权限。
 */

import { canMutate, type OwnershipActor } from "./ownership.js";
import { hasPermission } from "../../middleware/auth.js";

/** 需要审批权限、且审批人不能是本人的动作。 */
const APPROVAL_ACTIONS = new Set(["approve", "reject", "pay"]);

export type ExpenseDocumentKind = "reimbursement" | "advance";

export interface ExpenseActionVerdict {
  ok: boolean;
  status?: number;
  error?: string;
  code?: string;
}

const LABELS: Record<ExpenseDocumentKind, { noun: string; selfCode: string; forbiddenCode: string; notOwnerCode: string }> = {
  reimbursement: {
    noun: "报销单",
    selfCode: "REIMBURSEMENT_SELF_APPROVAL",
    forbiddenCode: "REIMBURSEMENT_APPROVAL_FORBIDDEN",
    notOwnerCode: "REIMBURSEMENT_NOT_OWNER"
  },
  advance: {
    noun: "借款单",
    selfCode: "ADVANCE_SELF_APPROVAL",
    forbiddenCode: "ADVANCE_APPROVAL_FORBIDDEN",
    notOwnerCode: "ADVANCE_NOT_OWNER"
  }
};

/**
 * 这个人能不能对这张单据做这个动作。
 *
 * @param ownerUserId 单据的归属人——报销是申请人，借款是借款人。
 */
export function checkExpenseAction(
  kind: ExpenseDocumentKind,
  action: string,
  ownerUserId: string,
  actor: OwnershipActor
): ExpenseActionVerdict {
  const label = LABELS[kind];

  if (APPROVAL_ACTIONS.has(action)) {
    // **审批人 ≠ 归属人**，任何角色都绕不过去。
    // 出纳自借自批自付走的就是这个口子。
    if (ownerUserId === actor.userId) {
      return {
        ok: false,
        status: 403,
        error: `不能审批或付款自己提交的${label.noun}。请交给有审批权限的同事处理。`,
        code: label.selfCode
      };
    }
    if (!hasPermission([...actor.roleCodes], "expense.manage")) {
      return {
        ok: false,
        status: 403,
        error: `只有有费用审批权限的人可以批准、驳回或付款。`,
        code: label.forbiddenCode
      };
    }
    return { ok: true };
  }

  // submit / cancel 只能动自己的单（有管理权限的人不受限，见 canMutate）。
  if (!canMutate(kind, ownerUserId, actor)) {
    return {
      ok: false,
      status: 403,
      error: `只能提交或撤回自己的${label.noun}。`,
      code: label.notOwnerCode
    };
  }

  return { ok: true };
}
