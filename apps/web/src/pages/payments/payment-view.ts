/**
 * 付款中心的展示逻辑（V13-C7）。
 */

import type {
  ContractPaymentProgress,
  DuePaymentRow,
  PaymentScheduleStatus,
  PaymentStatus
} from "../../lib/api-expense-control";

export const SCHEDULE_STATUS_META: Record<
  PaymentScheduleStatus,
  { label: string; color: string }
> = {
  pending: { label: "待付", color: "default" },
  partial: { label: "部分付款", color: "processing" },
  paid: { label: "已付", color: "success" },
  overdue: { label: "逾期", color: "error" },
  cancelled: { label: "已作废", color: "default" }
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  submitted: { label: "待确认", color: "processing" },
  paid: { label: "已付款", color: "success" },
  cancelled: { label: "已作废", color: "default" }
};

/** 一期还差多少没付。 */
export function remainingCents(row: Pick<DuePaymentRow, "amountCents" | "paidCents">): number {
  return row.amountCents - row.paidCents;
}

/**
 * 合同付款进度的一句话描述。
 *
 * **「主体已付清、质保金待释放」要能说出来**——这是质保金做成独立一期的
 * 全部意义所在。只说「已付 90%」会让人以为还差一笔正常的款没付。
 */
export function describeProgress(progress: ContractPaymentProgress): string {
  if (progress.totalCents === 0) return "尚未录入付款计划";
  if (progress.isFullyPaid) return "已全部付清";
  if (progress.isMainPaid) {
    return `主体款项已付清，质保金 ${(progress.retentionCents / 100).toFixed(2)} 元待释放`;
  }
  return `待付 ${(progress.unpaidCents / 100).toFixed(2)} 元${
    progress.retentionCents > 0
      ? `，另有质保金 ${(progress.retentionCents / 100).toFixed(2)} 元`
      : ""
  }`;
}

/**
 * 应付列表按对方分组的合计。
 *
 * 出纳实际的操作是「今天给这家转一笔」，而不是逐期转——同一家供应商的
 * 多期到期款要能一眼看到合计。
 */
export function groupDueByCounterparty(
  rows: readonly DuePaymentRow[]
): { counterpartyName: string; totalCents: number; count: number }[] {
  const map = new Map<string, { totalCents: number; count: number }>();
  for (const row of rows) {
    const current = map.get(row.counterpartyName) ?? { totalCents: 0, count: 0 };
    map.set(row.counterpartyName, {
      totalCents: current.totalCents + remainingCents(row),
      count: current.count + 1
    });
  }
  return [...map.entries()]
    .map(([counterpartyName, value]) => ({ counterpartyName, ...value }))
    // 金额大的排前面：出纳一次能处理的有限，先看大额更符合风险优先。
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
