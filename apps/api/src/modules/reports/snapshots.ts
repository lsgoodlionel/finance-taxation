import type {
  BalanceSheetReport,
  CashFlowReport,
  FinancialReportLine,
  ProfitStatementReport,
  ReportDiffResult,
  ReportSnapshot
} from "@finance-taxation/domain-model";

function parseAmount(value: string): number {
  return Number(value || 0);
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function collectLines(
  payload: BalanceSheetReport | ProfitStatementReport | CashFlowReport
): FinancialReportLine[] {
  if ("assets" in payload) {
    return [...payload.assets, ...payload.liabilities, ...payload.equity];
  }
  if ("revenues" in payload) {
    return [...payload.revenues, ...payload.costsAndExpenses];
  }
  return [
    ...payload.sections.operating,
    ...payload.sections.investing,
    ...payload.sections.financing
  ];
}

export function buildReportDiff(
  fromSnapshot: ReportSnapshot,
  toSnapshot: ReportSnapshot
): ReportDiffResult {
  const fromLines = collectLines(fromSnapshot.payload);
  const toLines = collectLines(toSnapshot.payload);
  const lineMap = new Map<string, { label: string; fromAmount: number; toAmount: number }>();

  for (const line of fromLines) {
    lineMap.set(line.code, {
      label: line.label,
      fromAmount: parseAmount(line.amount),
      toAmount: 0
    });
  }

  for (const line of toLines) {
    const current = lineMap.get(line.code);
    if (current) {
      current.toAmount = parseAmount(line.amount);
      continue;
    }
    lineMap.set(line.code, {
      label: line.label,
      fromAmount: 0,
      toAmount: parseAmount(line.amount)
    });
  }

  return {
    reportType: toSnapshot.reportType,
    fromSnapshotId: fromSnapshot.id,
    toSnapshotId: toSnapshot.id,
    lines: Array.from(lineMap.entries())
      .map(([code, value]) => ({
        code,
        label: value.label,
        fromAmount: formatAmount(value.fromAmount),
        toAmount: formatAmount(value.toAmount),
        delta: formatAmount(value.toAmount - value.fromAmount)
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  };
}
