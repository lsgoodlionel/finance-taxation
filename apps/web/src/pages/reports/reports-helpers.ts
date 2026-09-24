import type { ReportSnapshot } from "@finance-taxation/domain-model";
import type { ReportsWorkbenchView } from "./report-types";

const REPORT_TYPE_LABELS: Record<ReportSnapshot["reportType"], string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

export const defaultReportsView: ReportsWorkbenchView = "balanceSheet";

/** V7 K3：guided 模式进报表页默认落「老板摘要」，pro 保持三表工作台。 */
export function resolveInitialReportsView(mode: "guided" | "pro"): ReportsWorkbenchView {
  return mode === "guided" ? "chairman" : defaultReportsView;
}

/** 取最新快照（按 snapshotDate 降序，ISO 字符串可直接比较），无快照返回 null。 */
export function pickLatestSnapshotId(
  snapshots: readonly Pick<ReportSnapshot, "id" | "snapshotDate">[]
): string | null {
  if (snapshots.length === 0) {
    return null;
  }
  const latest = snapshots.reduce((best, candidate) =>
    candidate.snapshotDate > best.snapshotDate ? candidate : best
  );
  return latest.id;
}

export function formatSnapshotLabel(input: Pick<ReportSnapshot, "reportType" | "periodLabel">): string {
  return `${input.periodLabel} ${REPORT_TYPE_LABELS[input.reportType]}`;
}

export function getWorkbenchViewLabel(view: ReportsWorkbenchView): string {
  switch (view) {
    case "balanceSheet":
      return "资产负债表";
    case "profitStatement":
      return "利润表";
    case "cashFlow":
      return "现金流量表";
    case "diff":
      return "差异分析";
    case "chairman":
      return "老板摘要";
    case "budgetVariance":
      return "预算差异";
    case "costCenter":
      return "部门费用";
    case "trialBalance":
      return "试算平衡";
    default:
      return "财务报表";
  }
}

export function getSnapshotSelectionLabel(snapshotId: string, snapshots: ReportSnapshot[]): string {
  if (!snapshotId) {
    return "未选择";
  }
  const snapshot = snapshots.find((item) => item.id === snapshotId);
  return snapshot ? formatSnapshotLabel(snapshot) : "已选择快照";
}

/**
 * 从快照的期间标签还原出重新生成它所需的参数（V15/P1）。
 *
 * 快照被判定为「账已变动」之后，用户要能就地重算——而重算接口收的是
 * year/month/quarter，快照上存的却是标签。**这一步不能猜**：把 `2026 Q3`
 * 错解析成 3 月，会静默生成一份期间不对的报表覆盖掉原来那份。
 *
 * 解析不出来时返回 null，调用方据此禁用按钮，而不是拿默认值去生成。
 */
export interface SnapshotPeriodParams {
  periodType: "month" | "quarter" | "year";
  year: number;
  month: number;
  quarter: number;
}

export function parseSnapshotPeriod(periodLabel: string): SnapshotPeriodParams | null {
  const label = (periodLabel || "").trim();

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(label);
  if (monthMatch) {
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) return null;
    return {
      periodType: "month",
      year: Number(monthMatch[1]),
      month,
      quarter: Math.ceil(month / 3)
    };
  }

  const quarterMatch = /^(\d{4})\s*Q([1-4])$/.exec(label);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[2]);
    return {
      periodType: "quarter",
      year: Number(quarterMatch[1]),
      // 季度末月：重算接口按 quarter 取期间，month 只是补齐，取季末更不容易误导。
      month: quarter * 3,
      quarter
    };
  }

  const yearMatch = /^(\d{4})$/.exec(label);
  if (yearMatch) {
    return { periodType: "year", year: Number(yearMatch[1]), month: 12, quarter: 4 };
  }

  return null;
}
