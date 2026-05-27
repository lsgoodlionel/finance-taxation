import React from "react";
import type {
  BalanceSheetReport,
  CashFlowReport,
  ChairmanReportSummary,
  ProfitStatementReport,
  ReportDiffResult
} from "@finance-taxation/domain-model";
import { ResultBanner } from "../../components/ui/ResultBanner";
import type { ReportsStatus, ReportsWorkbenchView } from "./report-types";
import { getWorkbenchViewLabel } from "./reports-helpers";
import { BalanceSheetPanel } from "./panels/BalanceSheetPanel";
import { CashFlowPanel } from "./panels/CashFlowPanel";
import { ChairmanSummaryPanel } from "./panels/ChairmanSummaryPanel";
import { ProfitStatementPanel } from "./panels/ProfitStatementPanel";
import { ReportDiffPanel } from "./panels/ReportDiffPanel";

type ReportsWorkbenchProps = {
  activeView: ReportsWorkbenchView;
  status: ReportsStatus;
  balanceSheet: BalanceSheetReport | null;
  profitStatement: ProfitStatementReport | null;
  cashFlow: CashFlowReport | null;
  diff: ReportDiffResult | null;
  chairmanSummary: ChairmanReportSummary | null;
};

export function ReportsWorkbench({
  activeView,
  status,
  balanceSheet,
  profitStatement,
  cashFlow,
  diff,
  chairmanSummary
}: ReportsWorkbenchProps) {
  const activeViewLabel = getWorkbenchViewLabel(activeView);

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <section
        style={{
          display: "grid",
          gap: "12px",
          padding: "20px 24px",
          borderRadius: "20px",
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(20,40,60,0.08)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>结果工作台</span>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#1e2a37" }}>{activeViewLabel}</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#4d5d6c", lineHeight: 1.7 }}>
              左侧先固定上下文并触发动作，右侧只负责展示当前结果，减少报表、差异和输出信息混写。
            </p>
          </div>
        </div>
        <ResultBanner tone={status.tone} message={status.message} />
      </section>

      {activeView === "balanceSheet" ? <BalanceSheetPanel report={balanceSheet} /> : null}
      {activeView === "profitStatement" ? <ProfitStatementPanel report={profitStatement} /> : null}
      {activeView === "cashFlow" ? <CashFlowPanel report={cashFlow} /> : null}
      {activeView === "diff" ? <ReportDiffPanel diff={diff} /> : null}
      {activeView === "chairman" ? <ChairmanSummaryPanel summary={chairmanSummary} /> : null}
    </section>
  );
}
