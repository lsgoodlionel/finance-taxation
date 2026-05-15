import type {
  ChairmanReportSummary,
  ReportSnapshot,
  RiskFinding,
  TaxpayerProfile
} from "@finance-taxation/domain-model";

export function buildChairmanReportSummary(input: {
  snapshot: ReportSnapshot;
  taxpayerProfile: TaxpayerProfile | null;
  findings: RiskFinding[];
}): ChairmanReportSummary {
  const risks = input.findings
    .filter((item) => item.status === "open")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3)
    .map((item) => `${item.priority || "P?"} ${item.title}`);

  const taxLabel = input.taxpayerProfile
    ? `纳税人口径：${input.taxpayerProfile.taxpayerType}`
    : "纳税人口径未配置";

  if (input.snapshot.reportType === "balance_sheet") {
    const payload = input.snapshot.payload;
    if ("totals" in payload && "assets" in payload) {
      return {
        reportType: input.snapshot.reportType,
        periodLabel: input.snapshot.periodLabel,
        headline: `截至 ${input.snapshot.periodLabel}，资产总额 ${payload.totals.assets}，负债和权益合计 ${payload.totals.liabilitiesAndEquity}。`,
        highlights: [taxLabel, `资产负债表快照日期：${input.snapshot.snapshotDate}`],
        risks
      };
    }
  }

  if (input.snapshot.reportType === "profit_statement") {
    const payload = input.snapshot.payload;
    if ("totals" in payload && "netProfit" in payload.totals) {
      return {
        reportType: input.snapshot.reportType,
        periodLabel: input.snapshot.periodLabel,
        headline: `${input.snapshot.periodLabel} 营业收入 ${payload.totals.revenue}，净利润 ${payload.totals.netProfit}。`,
        highlights: [taxLabel, `期间费用 ${payload.totals.expenses}`],
        risks
      };
    }
  }

  const payload = input.snapshot.payload;
  return {
    reportType: input.snapshot.reportType,
    periodLabel: input.snapshot.periodLabel,
    headline: `${input.snapshot.periodLabel} 现金净增加额 ${"totals" in payload && "netCashChange" in payload.totals ? payload.totals.netCashChange : "0"}。`,
    highlights: [taxLabel],
    risks
  };
}
