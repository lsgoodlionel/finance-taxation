import type { ReportSnapshot } from "@finance-taxation/domain-model";
import type { BundleKind, ReportsPeriodState, ReportsWorkbenchView } from "./report-types";

const REPORT_TYPE_LABELS: Record<ReportSnapshot["reportType"], string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

export const defaultReportsView: ReportsWorkbenchView = "balanceSheet";

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
    default:
      return "财务报表";
  }
}

export function resolveBundlePeriodLabel(
  kind: BundleKind,
  period: Pick<ReportsPeriodState, "year" | "month" | "quarter">,
  reportPeriodLabel?: string
): string {
  if (reportPeriodLabel) {
    return reportPeriodLabel;
  }
  if (kind === "month_end") {
    return `${period.year}-${String(period.month).padStart(2, "0")}`;
  }
  if (kind === "audit") {
    return `${period.year}-Q${period.quarter}`;
  }
  return String(period.year);
}

export function getSnapshotSelectionLabel(snapshotId: string, snapshots: ReportSnapshot[]): string {
  if (!snapshotId) {
    return "未选择";
  }
  const snapshot = snapshots.find((item) => item.id === snapshotId);
  return snapshot ? formatSnapshotLabel(snapshot) : "已选择快照";
}
