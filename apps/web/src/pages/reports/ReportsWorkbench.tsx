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
  const summaryCards = resolveSummaryCards(activeView, {
    balanceSheet,
    profitStatement,
    cashFlow,
    diff,
    chairmanSummary
  });

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
        {summaryCards.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px"
            }}
          >
            {summaryCards.map((card) => (
              <div
                key={card.label}
                style={{
                  display: "grid",
                  gap: "4px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: card.tint,
                  border: "1px solid rgba(20,40,60,0.08)"
                }}
              >
                <span style={{ fontSize: "11px", color: "#516172", textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.label}</span>
                <strong style={{ fontSize: "18px", color: "#1e2a37" }}>{card.value}</strong>
                {card.note ? <span style={{ fontSize: "12px", color: "#607080" }}>{card.note}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {activeView === "balanceSheet" ? <BalanceSheetPanel report={balanceSheet} /> : null}
      {activeView === "profitStatement" ? <ProfitStatementPanel report={profitStatement} /> : null}
      {activeView === "cashFlow" ? <CashFlowPanel report={cashFlow} /> : null}
      {activeView === "diff" ? <ReportDiffPanel diff={diff} /> : null}
      {activeView === "chairman" ? <ChairmanSummaryPanel summary={chairmanSummary} /> : null}
    </section>
  );
}

type SummaryCard = {
  label: string;
  value: string;
  note?: string;
  tint: string;
};

function resolveSummaryCards(
  activeView: ReportsWorkbenchView,
  input: Pick<ReportsWorkbenchProps, "balanceSheet" | "profitStatement" | "cashFlow" | "diff" | "chairmanSummary">
): SummaryCard[] {
  if (activeView === "balanceSheet" && input.balanceSheet) {
    return [
      { label: "资产合计", value: input.balanceSheet.totals.assets, tint: "rgba(37,99,235,0.08)" },
      { label: "负债合计", value: input.balanceSheet.totals.liabilities, tint: "rgba(248,113,113,0.10)" },
      { label: "权益合计", value: input.balanceSheet.totals.equity, tint: "rgba(22,163,74,0.10)" }
    ];
  }
  if (activeView === "profitStatement" && input.profitStatement) {
    return [
      { label: "营业收入", value: input.profitStatement.totals.revenue, tint: "rgba(37,99,235,0.08)" },
      { label: "期间费用", value: input.profitStatement.totals.expenses, tint: "rgba(245,158,11,0.12)" },
      { label: "净利润", value: input.profitStatement.totals.netProfit, tint: "rgba(22,163,74,0.10)" }
    ];
  }
  if (activeView === "cashFlow" && input.cashFlow) {
    return [
      { label: "经营净现金", value: input.cashFlow.totals.operatingNetCash, tint: "rgba(37,99,235,0.08)" },
      { label: "投资净现金", value: input.cashFlow.totals.investingNetCash, tint: "rgba(217,119,6,0.12)" },
      { label: "净增加额", value: input.cashFlow.totals.netCashChange, tint: "rgba(22,163,74,0.10)" }
    ];
  }
  if (activeView === "diff" && input.diff) {
    const deltaCount = input.diff.lines.filter((line) => line.delta && line.delta !== "¥0.00").length;
    return [
      { label: "对比报表", value: input.diff.reportType, tint: "rgba(37,99,235,0.08)" },
      { label: "差异行数", value: String(input.diff.lines.length), note: "当前加载结果", tint: "rgba(245,158,11,0.12)" },
      { label: "变动行数", value: String(deltaCount), note: "非零差异项目", tint: "rgba(168,85,247,0.12)" }
    ];
  }
  if (activeView === "chairman" && input.chairmanSummary) {
    return [
      { label: "摘要期间", value: input.chairmanSummary.periodLabel, tint: "rgba(37,99,235,0.08)" },
      { label: "关键信息", value: String(input.chairmanSummary.highlights.length), note: "高层摘要条目", tint: "rgba(22,163,74,0.10)" },
      { label: "重点风险", value: String(input.chairmanSummary.risks.length), note: "待重点关注", tint: "rgba(248,113,113,0.10)" }
    ];
  }
  return [];
}
