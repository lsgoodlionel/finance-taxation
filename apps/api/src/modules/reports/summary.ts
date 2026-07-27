import type {
  BalanceSheetReport,
  CashFlowReport,
  ChartAccount,
  FinancialReportLine,
  LedgerEntry,
  ProfitStatementReport
} from "@finance-taxation/domain-model";
import { classifyProfitAccount, summarizeProfitTotals } from "./profit-accounts.js";

interface PeriodInput {
  periodLabel: string;
  entries: LedgerEntry[];
}

interface BalanceSheetInput extends PeriodInput {
  asOfDate: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAmount(value: string): number {
  return Number(value || 0);
}

function formatAmount(value: number): string {
  const rounded = round(value);
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function sumEntries(entries: LedgerEntry[], predicate: (entry: LedgerEntry) => boolean): number {
  return entries
    .filter(predicate)
    .reduce((sum, entry) => sum + parseAmount(entry.debit) - parseAmount(entry.credit), 0);
}

function accountAmount(
  entries: LedgerEntry[],
  account: ChartAccount
): number {
  const signed = sumEntries(entries, (entry) => entry.accountCode === account.code);
  return account.direction === "debit" ? signed : -signed;
}

function nonZeroLines(lines: FinancialReportLine[]): FinancialReportLine[] {
  return lines.filter((line) => Math.abs(parseAmount(line.amount)) > 0.0001);
}

function hasPrefix(code: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

export function buildBalanceSheetReport(input: BalanceSheetInput): BalanceSheetReport {
  const asOfEntries = input.entries.filter((entry) => entry.entryDate <= input.asOfDate);
  const balanceMap = new Map<string, number>();
  for (const entry of asOfEntries) {
    const current = balanceMap.get(entry.accountCode) || 0;
    balanceMap.set(entry.accountCode, current + parseAmount(entry.debit) - parseAmount(entry.credit));
  }

  const assetLines: FinancialReportLine[] = [];
  const liabilityLines: FinancialReportLine[] = [];
  const equityLines: FinancialReportLine[] = [];

  // 本年利润与利润表共用同一个汇总函数（V8-P）：此前资产负债表自带一套「精确匹配
  // 4 个收入科目、其余 6 开头一律当费用」的平行判定，与利润表的前缀表口径不同，
  // 同一笔分录在两张表上归类不一致（6602 在此被计入费用，在利润表却被丢弃）。
  // summarizeProfitTotals 的 netProfit = 收入 - 成本 - 费用 - 所得税费用，与旧的
  // totalRevenue - totalExpense（totalExpense 含所得税）逐项等价。
  const netProfit = summarizeProfitTotals(asOfEntries).netProfit;

  if (Math.abs(netProfit) > 0.0001 && !equityLines.some((item) => item.code === "3131")) {
    equityLines.push({
      code: "3131",
      label: "本年利润",
      amount: formatAmount(netProfit)
    });
  }

  for (const [accountCode, amount] of balanceMap.entries()) {
    if (hasPrefix(accountCode, ["1"])) {
      assetLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(amount)
      });
    } else if (hasPrefix(accountCode, ["2"])) {
      liabilityLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(-amount)
      });
    } else if (hasPrefix(accountCode, ["3"])) {
      const adjusted = accountCode === "3131" ? -amount + netProfit : -amount;
      equityLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(adjusted)
      });
    }
  }

  const normalizedAssetLines = nonZeroLines(assetLines).sort((a, b) => a.code.localeCompare(b.code));
  const normalizedLiabilityLines = nonZeroLines(liabilityLines).sort((a, b) => a.code.localeCompare(b.code));
  const normalizedEquityLines = nonZeroLines(equityLines).sort((a, b) => a.code.localeCompare(b.code));

  const assetsTotal = normalizedAssetLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const liabilitiesTotal = normalizedLiabilityLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const equityTotal = normalizedEquityLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);

  return {
    periodLabel: input.periodLabel,
    asOfDate: input.asOfDate,
    assets: normalizedAssetLines,
    liabilities: normalizedLiabilityLines,
    equity: normalizedEquityLines,
    totals: {
      assets: formatAmount(assetsTotal),
      liabilities: formatAmount(liabilitiesTotal),
      equity: formatAmount(equityTotal),
      liabilitiesAndEquity: formatAmount(liabilitiesTotal + equityTotal)
    }
  };
}

export function buildProfitStatementReport(input: PeriodInput): ProfitStatementReport {
  const revenueLines: FinancialReportLine[] = [];
  const costExpenseLines: FinancialReportLine[] = [];
  const sums = new Map<string, { name: string; amount: number }>();

  for (const entry of input.entries) {
    const current = sums.get(entry.accountCode) || {
      name: entry.accountName,
      amount: 0
    };
    current.amount += parseAmount(entry.debit) - parseAmount(entry.credit);
    sums.set(entry.accountCode, current);
  }

  for (const [code, { name, amount }] of sums.entries()) {
    const kind = classifyProfitAccount(code);
    if (kind === "revenue") {
      revenueLines.push({ code, label: name, amount: formatAmount(-amount) });
      continue;
    }
    if (kind === "cost" || kind === "expense") {
      costExpenseLines.push({ code, label: name, amount: formatAmount(amount) });
    }
  }

  // 总额与驾驶舱共用同一个纯函数，保证同一份数据在 /reports 与 /home 上完全一致。
  const totals = summarizeProfitTotals(input.entries);

  return {
    periodLabel: input.periodLabel,
    revenues: nonZeroLines(revenueLines).sort((a, b) => a.code.localeCompare(b.code)),
    costsAndExpenses: nonZeroLines(costExpenseLines).sort((a, b) => a.code.localeCompare(b.code)),
    totals: {
      revenue: formatAmount(totals.revenue),
      cost: formatAmount(totals.cost),
      grossProfit: formatAmount(totals.grossProfit),
      // expense 已不含所得税费用（6801 是利润总额之后的独立项目），故
      // grossProfit - expenses = totalProfit 在展示上自洽；6801 明细仍保留在
      // costsAndExpenses 行内，金额不会从报表中消失。
      expenses: formatAmount(totals.expense),
      totalProfit: formatAmount(totals.totalProfit),
      netProfit: formatAmount(totals.netProfit)
    }
  };
}

function classifyCashFlow(entries: LedgerEntry[]): CashFlowReport["sections"] & CashFlowReport["totals"] {
  const byVoucher = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const list = byVoucher.get(entry.voucherId) || [];
    list.push(entry);
    byVoucher.set(entry.voucherId, list);
  }

  let operatingIn = 0;
  let operatingOut = 0;
  let investingIn = 0;
  let investingOut = 0;
  let financingIn = 0;
  let financingOut = 0;

  for (const voucherEntries of byVoucher.values()) {
    const cashEntries = voucherEntries.filter((entry) => hasPrefix(entry.accountCode, ["1001", "1002", "1012"]));
    if (!cashEntries.length) continue;
    const netCash = cashEntries.reduce((sum, entry) => sum + parseAmount(entry.debit) - parseAmount(entry.credit), 0);
    if (netCash === 0) continue;

    const counterCodes = voucherEntries
      .filter((entry) => !hasPrefix(entry.accountCode, ["1001", "1002", "1012"]))
      .map((entry) => entry.accountCode);

    const isInvesting = counterCodes.some((code) =>
      hasPrefix(code, ["1601", "1701", "1801002"])
    );
    const isFinancing = counterCodes.some((code) =>
      hasPrefix(code, ["2001", "2401", "3001", "3002", "3141"])
    );

    if (netCash > 0) {
      if (isFinancing) financingIn += netCash;
      else if (isInvesting) investingIn += netCash;
      else operatingIn += netCash;
    } else {
      const absCash = Math.abs(netCash);
      if (isInvesting || counterCodes.some((code) => hasPrefix(code, ["1801001", "1801002"]))) investingOut += absCash;
      else if (isFinancing) financingOut += absCash;
      else operatingOut += absCash;
    }
  }

  return {
    operating: [
      { code: "OP-IN", label: "经营活动现金流入", amount: formatAmount(operatingIn) },
      { code: "OP-OUT", label: "经营活动现金流出", amount: formatAmount(operatingOut) }
    ],
    investing: [
      { code: "IV-IN", label: "投资活动现金流入", amount: formatAmount(investingIn) },
      { code: "IV-OUT", label: "投资活动现金流出", amount: formatAmount(investingOut) }
    ],
    financing: [
      { code: "FN-IN", label: "筹资活动现金流入", amount: formatAmount(financingIn) },
      { code: "FN-OUT", label: "筹资活动现金流出", amount: formatAmount(financingOut) }
    ],
    operatingNetCash: formatAmount(operatingIn - operatingOut),
    investingNetCash: formatAmount(investingIn - investingOut),
    financingNetCash: formatAmount(financingIn - financingOut),
    netCashChange: formatAmount((operatingIn - operatingOut) + (investingIn - investingOut) + (financingIn - financingOut))
  };
}

export function buildCashFlowReport(input: PeriodInput): CashFlowReport {
  const result = classifyCashFlow(input.entries);
  return {
    periodLabel: input.periodLabel,
    sections: {
      operating: result.operating,
      investing: result.investing,
      financing: result.financing
    },
    totals: {
      operatingNetCash: result.operatingNetCash,
      investingNetCash: result.investingNetCash,
      financingNetCash: result.financingNetCash,
      netCashChange: result.netCashChange
    }
  };
}
