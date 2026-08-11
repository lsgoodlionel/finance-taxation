import type {
  BalanceSheetReport,
  CashFlowReport,
  ChairmanReportSummary,
  ProfitStatementReport,
  ReportDiffResult,
  ReportSnapshot
} from "@finance-taxation/domain-model";

export type ReportsWorkbenchView =
  | "balanceSheet"
  | "profitStatement"
  | "cashFlow"
  | "diff"
  | "chairman"
  | "budgetVariance"
  // 管理口径，不是法定报表：按成本中心归集本期费用（V12-D1）
  | "costCenter";

export type ReportsStatus = {
  tone: "info" | "success" | "error";
  message: string;
};

export type ReportsPeriodState = {
  periodType: "month" | "quarter" | "year";
  year: number;
  month: number;
  quarter: number;
};

export type ReportsDataState = {
  balanceSheet: BalanceSheetReport | null;
  profitStatement: ProfitStatementReport | null;
  cashFlow: CashFlowReport | null;
  snapshots: ReportSnapshot[];
  diff: ReportDiffResult | null;
  chairmanSummary: ChairmanReportSummary | null;
};
