/**
 * 报销单的展示逻辑（V13-B8）。
 */

import type { ReimbursementLine, ReimbursementStatus } from "../../lib/api-expense-control";

export const REIMBURSEMENT_STATUS_META: Record<
  ReimbursementStatus,
  { label: string; color: string }
> = {
  draft: { label: "草稿", color: "default" },
  pending: { label: "审批中", color: "processing" },
  approved: { label: "已批准", color: "success" },
  rejected: { label: "已驳回", color: "error" },
  paid: { label: "已付款", color: "default" },
  cancelled: { label: "已作废", color: "default" }
};

/**
 * 明细合计。
 *
 * 与服务端同一口径——那边也不存这个数。表单上实时算出来显示，让用户在
 * 提交前就看到，而不是提交后才发现与预期不符。
 */
export function sumLineCents(lines: readonly Pick<ReimbursementLine, "amountCents">[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/**
 * 冲抵借款后的差额（分）。
 *
 * 正数 = 员工要退回，负数 = 公司要补给员工，零 = 正好冲平。
 *
 * **不返回「该退还是该补」的枚举**：那等于把符号翻译成文字，而翻译的那一步
 * 正是最容易写反的地方。调用方按符号显示即可。
 */
export function advanceSettlementDiffCents(
  outstandingCents: number,
  reimbursementTotalCents: number
): number {
  return outstandingCents - reimbursementTotalCents;
}
