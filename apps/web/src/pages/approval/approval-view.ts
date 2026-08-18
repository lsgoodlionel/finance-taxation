/**
 * 审批工作台的展示逻辑（V13-A6）。
 *
 * 从组件里拆出来是为了能测。这里的判断关乎「审批人看到的是不是真相」——
 * 进度显示错了，审批人会以为自己是最后一关而放松审查。
 */

import type { ApprovalDocumentType, ApprovalInstance } from "../../lib/api-expense-control";

export const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  request: "申请单",
  advance: "借款",
  reimbursement: "报销单",
  payment: "付款单",
  contract: "合同"
};

/**
 * 当前是第几步、共几步。
 *
 * **分母是 `requiredStepOrders.length` 而不是流程定义的总步数**：金额分级会
 * 让一张单只走其中几级，显示「第 1 步 / 共 3 步」而实际只需 1 步，审批人会
 * 以为后面还有人把关。
 */
export function stepProgress(instance: ApprovalInstance): { current: number; total: number } | null {
  if (instance.currentStepOrder === null) return null;
  const index = instance.requiredStepOrders.indexOf(instance.currentStepOrder);
  // 当前步骤不在 required 列表里说明数据不一致（流程被改过）。返回 null 让
  // 界面显示「进度未知」，好过显示一个编出来的数字。
  if (index < 0) return null;
  return { current: index + 1, total: instance.requiredStepOrders.length };
}

/** 当前这一步是不是最后一关——批下去就生效了，值得在界面上说明白。 */
export function isFinalStep(instance: ApprovalInstance): boolean {
  const progress = stepProgress(instance);
  return progress !== null && progress.current === progress.total;
}

/** 分 → 带千分位的元。 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 待办排序：金额大的在前。
 *
 * 不按时间排——审批人一次能处理的有限，先看大额比先看早到的更符合风险优先。
 * 同额时按单据号，保证顺序稳定（否则每次刷新顺序都在跳）。
 */
export function sortByRisk(items: readonly ApprovalInstance[]): ApprovalInstance[] {
  return [...items].sort((a, b) => {
    if (b.amountCents !== a.amountCents) return b.amountCents - a.amountCents;
    return a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0;
  });
}
