import React, { type ReactNode } from "react";
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
import { STATEMENT_VIEWS, isStatementView } from "./reports-tasks";
import { BalanceSheetPanel } from "./panels/BalanceSheetPanel";
import { BudgetVariancePanel } from "./panels/BudgetVariancePanel";
import { CashFlowPanel } from "./panels/CashFlowPanel";
import { ChairmanSummaryPanel } from "./panels/ChairmanSummaryPanel";
import { ProfitStatementPanel } from "./panels/ProfitStatementPanel";

type ReportsWorkbenchProps = {
  activeView: ReportsWorkbenchView;
  status: ReportsStatus;
  balanceSheet: BalanceSheetReport | null;
  profitStatement: ProfitStatementReport | null;
  cashFlow: CashFlowReport | null;
  chairmanSummary: ChairmanReportSummary | null;
  diff: ReportDiffResult | null;
  /** 「对比两期变化」这件事的完整工作区（挑快照 + 生成 + 差异结果）。 */
  comparePanel: ReactNode;
  onSelectStatement: (view: ReportsWorkbenchView) => void;
  defaultPeriod: string;
};

const STRIP_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 12,
  padding: "16px 20px",
  borderRadius: 20,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(20,40,60,0.08)"
};

const SWITCH_ROW_STYLE: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

const CARD_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12
};

function statementButtonStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    minHeight: 40,
    borderRadius: 12,
    border: selected ? "1px solid rgba(37,99,235,0.4)" : "1px solid rgba(20,40,60,0.08)",
    background: selected ? "rgba(37,99,235,0.08)" : "rgba(248,250,252,0.9)",
    color: selected ? "#1d4ed8" : "#1e2a37",
    fontWeight: selected ? 700 : 500,
    cursor: "pointer"
  };
}

/**
 * 当前这件事的结果区：一条「状态 + 关键数字（+ 三表切换）」的紧凑条，加下面一块面板。
 *
 * 改造前这里是「结果工作台」大卡（标题 + 说明 + 状态 + 三张数字卡）再叠一块面板，
 * 说明文案还写着「左侧先固定上下文」——侧栏下线后那句话已经不成立，一并去掉。
 */
export function ReportsWorkbench({
  activeView,
  status,
  balanceSheet,
  profitStatement,
  cashFlow,
  chairmanSummary,
  diff,
  comparePanel,
  onSelectStatement,
  defaultPeriod
}: ReportsWorkbenchProps) {
  const summaryCards = resolveSummaryCards(activeView, {
    balanceSheet,
    profitStatement,
    cashFlow,
    chairmanSummary,
    diff
  });

  return (
    <>
      <section style={STRIP_STYLE} aria-label="当前结果概览">
        {isStatementView(activeView) ? (
          <div style={SWITCH_ROW_STYLE} role="group" aria-label="选择要看的报表">
            {STATEMENT_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={activeView === view}
                onClick={() => onSelectStatement(view)}
                style={statementButtonStyle(activeView === view)}
              >
                {getWorkbenchViewLabel(view)}
              </button>
            ))}
          </div>
        ) : null}
        <ResultBanner tone={status.tone} message={status.message} />
        {summaryCards.length > 0 ? (
          <div style={CARD_GRID_STYLE}>
            {summaryCards.map((card) => (
              <div
                key={card.label}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: card.tint,
                  border: "1px solid rgba(20,40,60,0.08)"
                }}
              >
                <span style={{ fontSize: 11, color: "#516172", letterSpacing: "0.04em" }}>{card.label}</span>
                <strong style={{ fontSize: 18, color: "#1e2a37" }}>{card.value}</strong>
                {card.note ? <span style={{ fontSize: 12, color: "#607080" }}>{card.note}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {activeView === "balanceSheet" ? <BalanceSheetPanel report={balanceSheet} /> : null}
      {activeView === "profitStatement" ? <ProfitStatementPanel report={profitStatement} /> : null}
      {activeView === "cashFlow" ? <CashFlowPanel report={cashFlow} /> : null}
      {activeView === "diff" ? comparePanel : null}
      {activeView === "chairman" ? <ChairmanSummaryPanel summary={chairmanSummary} /> : null}
      {activeView === "budgetVariance" ? <BudgetVariancePanel defaultPeriod={defaultPeriod} /> : null}
    </>
  );
}

type SummaryCard = {
  label: string;
  value: string;
  note?: string;
  tint: string;
};

type SummaryInput = Pick<
  ReportsWorkbenchProps,
  "balanceSheet" | "profitStatement" | "cashFlow" | "chairmanSummary" | "diff"
>;

function resolveSummaryCards(activeView: ReportsWorkbenchView, input: SummaryInput): SummaryCard[] {
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
