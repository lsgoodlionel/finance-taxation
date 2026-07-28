/**
 * /reports 的 URL 状态：当前在做哪件事（?task=）、三表里在看哪张（?report=）。
 *
 * 改造前本页完全没有 URL 状态，刷新即回默认视图，链接也分享不出「看现金流量表」
 * 这种具体落点。与 /tax、/risk 一致，把「当前这件事」写进查询参数，
 * 可刷新、可分享、可前进后退。
 */
import type { ReportsWorkbenchView } from "./report-types";
import { isStatementView } from "./reports-tasks";

export const REPORTS_TASK_QUERY_KEY = "task";
export const REPORTS_REPORT_QUERY_KEY = "report";

export type ReportsUrlState = {
  /** 空串表示由页面按模式取默认值。 */
  task: string;
  /** 「看三张报表」里选中的那张；非三表值一律丢弃。 */
  report: ReportsWorkbenchView | "";
};

export function readReportsUrlState(searchParams: URLSearchParams): ReportsUrlState {
  const report = searchParams.get(REPORTS_REPORT_QUERY_KEY) ?? "";
  return {
    task: searchParams.get(REPORTS_TASK_QUERY_KEY) ?? "",
    report: isStatementView(report as ReportsWorkbenchView) ? (report as ReportsWorkbenchView) : ""
  };
}

/** 只写非默认值，保持地址栏干净；其余既有查询参数由调用方自行合并。 */
export function writeReportsUrlState(state: ReportsUrlState): URLSearchParams {
  const next = new URLSearchParams();
  if (state.task) {
    next.set(REPORTS_TASK_QUERY_KEY, state.task);
  }
  if (state.report && state.report !== "balanceSheet") {
    next.set(REPORTS_REPORT_QUERY_KEY, state.report);
  }
  return next;
}
