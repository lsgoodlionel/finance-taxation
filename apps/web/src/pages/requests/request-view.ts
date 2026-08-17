/**
 * 申请与借款的展示逻辑（V13-B8）。
 *
 * 从组件里拆出来是为了能测。这里的判断决定用户看到哪些按钮——
 * 按钮给多了会让人点了才发现不行，给少了会让人以为功能没做。
 */

import type {
  AdvanceRow,
  AdvanceStatus,
  RequestAction,
  RequestRow,
  RequestStatus
} from "../../lib/api-expense-control";

export const REQUEST_TYPE_LABELS: Record<RequestRow["requestType"], string> = {
  travel: "出差申请",
  procurement: "采购申请",
  payment: "用款申请",
  other: "其他申请"
};

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  pending: { label: "审批中", color: "processing" },
  approved: { label: "已批准", color: "success" },
  rejected: { label: "已驳回", color: "error" },
  completed: { label: "已完成", color: "default" },
  cancelled: { label: "已作废", color: "default" }
};

export const ADVANCE_STATUS_META: Record<AdvanceStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  pending: { label: "审批中", color: "processing" },
  approved: { label: "待付款", color: "warning" },
  paid: { label: "已付款", color: "success" },
  settled: { label: "已结清", color: "default" },
  cancelled: { label: "已作废", color: "default" }
};

/**
 * 当前状态下发起人能做哪些动作。
 *
 * **与服务端的状态机同源**（`requests/lifecycle.ts` 的 TRANSITIONS）：
 * 前端多给一个按钮，用户点了才被 409 拒；少给一个，用户以为功能没做。
 * 两处各写一遍必然漂移，所以这里只列**发起人视角**的动作——
 * 批准/驳回属于审批人，在「我的审批」页，不在这里。
 */
export function availableRequestActions(status: RequestStatus): RequestAction[] {
  switch (status) {
    case "draft":
      return ["submit", "cancel"];
    case "rejected":
      // 驳回不是终点：改了可以再提。
      return ["submit", "cancel"];
    case "pending":
      return ["cancel"];
    case "approved":
      return ["complete", "cancel"];
    default:
      return [];
  }
}

export const REQUEST_ACTION_LABELS: Record<RequestAction, string> = {
  submit: "提交审批",
  approve: "批准",
  reject: "驳回",
  cancel: "作废",
  complete: "标记完成"
};

/** 只有草稿与被驳回的能改——与服务端 `canEdit` 同一口径。 */
export function canEditRequest(status: RequestStatus): boolean {
  return status === "draft" || status === "rejected";
}

/**
 * 借款是否逾期未还。
 *
 * 判据是**账上还有余额**且已过预计归还日。只看状态会漏掉「状态写着 paid
 * 但其实早还清了」的情况，只看日期会把已结清的也算成逾期。
 */
export function isAdvanceOverdue(advance: AdvanceRow, today: string): boolean {
  if (advance.outstandingCents <= 0) return false;
  if (advance.expectedReturnDate === null) return false;
  return today > advance.expectedReturnDate;
}

/** 分 → 带千分位的元。 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
