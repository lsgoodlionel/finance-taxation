import type {
  BalanceSheetReport,
  CashFlowReport,
  ChartAccount,
  FinancialReportLine,
  LedgerEntry,
  ProfitStatementReport
} from "@finance-taxation/domain-model";
import { isPeriodClosingEntry } from "../ledger/closing-entries.js";
import { classifyBalanceSheetAccount } from "./balance-sheet-accounts.js";
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

/** 本年利润科目：结转损益的对手方，也是资产负债表所有者权益里的利润归集行。 */
const PROFIT_ACCOUNT_CODE = "3131";

/**
 * 资产负债表 —— **不排除结转损益分录**（口径见 ledger/closing-entries.ts）。
 *
 * 判断依据：这不是「按期间聚合经营成果」，而是「截至某日的时点余额」。结转分录
 * 的对手方 3131 是权益类的真实余额，排除它反而会让权益凭空少一块、资产负债表不平。
 *
 * 更关键的是这两项之间的互补关系：`summarizeProfitTotals(asOfEntries).netProfit`
 * 在含结转分录时得到的恰好是**尚未结转的那部分损益**（已结转期间的 6xxx 被结转分录
 * 冲平、净额为 0），而 3131 的账面余额是**已结转的那部分**。两者相加才是截至 asOfDate
 * 的累计利润，缺一不可：
 *   - 全部已结转：netProfit = 0，3131 余额 = 全部利润；
 *   - 全部未结转：netProfit = 全部利润，3131 无余额；
 *   - 部分结转（月结后的常态）：两者各承担一半，相加仍然完整。
 * 若在这里排除结转分录，netProfit 会重新变成「全部利润」，与 3131 余额里已结转的
 * 部分重复计量，A = L + E 立刻被打破。
 */
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
  const unclassifiedLines: FinancialReportLine[] = [];

  // 本年利润与利润表共用同一个汇总函数（V8-P）：此前资产负债表自带一套「精确匹配
  // 4 个收入科目、其余 6 开头一律当费用」的平行判定，与利润表的前缀表口径不同，
  // 同一笔分录在两张表上归类不一致（6602 在此被计入费用，在利润表却被丢弃）。
  // summarizeProfitTotals 的 netProfit = 收入 - 成本 - 费用 - 所得税费用，与旧的
  // totalRevenue - totalExpense（totalExpense 含所得税）逐项等价。
  const netProfit = summarizeProfitTotals(asOfEntries).netProfit;

  // 3131 必须且只能出现一次，金额 = 已结转的账面余额 + 尚未结转的 netProfit。
  //
  // 此前这里先无条件 push 一行合成的 3131（守卫 `!equityLines.some(...)` 作用在
  // 刚声明、必然为空的 equityLines 上，恒为真，等于没有守卫），下面的循环遇到
  // 3131 的真实余额时又 push 了一行 `-amount + netProfit`，netProfit 被计入两次。
  // 结转过一部分期间、当期尚未结转时（月结之后的常态）两个条件同时成立：权益里
  // 出现两行同为 3131 的记录，合计虚增一个 netProfit，资产负债表直接不平。
  let hasProfitAccountBalance = false;

  // 每个科目都必须有明确去向（V12-A5 / 蓝图 E4）。此前这里是
  // `if 1 / else if 2 / else if 3` 且**没有 else**：4 开头的生产成本 4001 与
  // 制造费用 4101 既不进资产也不进负债权益，被静默丢弃，制造业客户的资产负债表
  // 直接不平。现在改用全函数 classifyBalanceSheetAccount，兜底走 unclassified
  // 并显式告警，不再有「掉到 else 外面」的可能。
  for (const [accountCode, amount] of balanceMap.entries()) {
    const section = classifyBalanceSheetAccount(accountCode);

    if (section === "asset") {
      assetLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(amount)
      });
    } else if (section === "liability") {
      liabilityLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(-amount)
      });
    } else if (section === "equity") {
      const isProfitAccount = accountCode === PROFIT_ACCOUNT_CODE;
      if (isProfitAccount) {
        hasProfitAccountBalance = true;
      }
      equityLines.push({
        code: accountCode,
        label: isProfitAccount ? "本年利润" : accountCode,
        amount: formatAmount(isProfitAccount ? -amount + netProfit : -amount)
      });
    } else if (section === "unclassified") {
      unclassifiedLines.push({
        code: accountCode,
        label: accountCode,
        amount: formatAmount(amount)
      });
    }
    // section === "profitAndLoss"：损益类净额已由 summarizeProfitTotals 汇总进
    // 上面权益的「本年利润」行，单列会重复计量。这是**显式**的不成行，不是丢弃。
  }

  // 账上还没有 3131 余额（从未结转过）时，未结转利润没有落脚点，补一行合成的。
  if (!hasProfitAccountBalance && Math.abs(netProfit) > 0.0001) {
    equityLines.push({
      code: PROFIT_ACCOUNT_CODE,
      label: "本年利润",
      amount: formatAmount(netProfit)
    });
  }

  const normalizedAssetLines = nonZeroLines(assetLines).sort((a, b) => a.code.localeCompare(b.code));
  const normalizedLiabilityLines = nonZeroLines(liabilityLines).sort((a, b) => a.code.localeCompare(b.code));
  const normalizedEquityLines = nonZeroLines(equityLines).sort((a, b) => a.code.localeCompare(b.code));
  const normalizedUnclassifiedLines = nonZeroLines(unclassifiedLines).sort((a, b) => a.code.localeCompare(b.code));

  const assetsTotal = normalizedAssetLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const liabilitiesTotal = normalizedLiabilityLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);
  const equityTotal = normalizedEquityLines.reduce((sum, item) => sum + parseAmount(item.amount), 0);

  // 未分类科目不计入任何合计——掺进去只会把「有科目没归好类」伪装成「表是平的」。
  // 所以必须同时给出告警，否则使用者只会看到一张莫名不平的表。
  const warnings = normalizedUnclassifiedLines.length > 0
    ? [
        `有 ${normalizedUnclassifiedLines.length} 个科目未纳入资产负债表口径（`
        + `${normalizedUnclassifiedLines.map((item) => item.code).join("、")}`
        + `），其余额未计入任何合计，资产负债表可能不平。请检查这些科目代码是否有效，`
        + `或在 accounts/chart-of-accounts.ts 中补登记。`
      ]
    : [];

  return {
    periodLabel: input.periodLabel,
    asOfDate: input.asOfDate,
    assets: normalizedAssetLines,
    liabilities: normalizedLiabilityLines,
    equity: normalizedEquityLines,
    unclassified: normalizedUnclassifiedLines,
    warnings,
    totals: {
      assets: formatAmount(assetsTotal),
      liabilities: formatAmount(liabilitiesTotal),
      equity: formatAmount(equityTotal),
      liabilitiesAndEquity: formatAmount(liabilitiesTotal + equityTotal)
    }
  };
}

/**
 * 利润表 —— **排除结转损益分录**（口径见 ledger/closing-entries.ts）。
 *
 * 判断依据：这是典型的「按期间聚合经营成果」。结转分录的 entry_date 落在被结转的
 * 期间之内、金额与该期间业务分录恰好相反，一旦计入，结转后本期收入/成本/费用/净利
 * 全部塌成 0。而月结是常规操作，不是边缘场景。
 *
 * 过滤放在本函数内而不是各调用方：`buildProfitStatementReport` 的语义就是利润表，
 * 没有任何一个调用方需要「含结转分录的利润表」。放在这里，/api/reports、报表快照、
 * 企业所得税底稿、底稿打印四条调用链一次性覆盖，也不会有新调用方漏掉。
 * 明细行（revenues / costsAndExpenses）与合计同源过滤，避免报表内部自相矛盾。
 */
export function buildProfitStatementReport(input: PeriodInput): ProfitStatementReport {
  const revenueLines: FinancialReportLine[] = [];
  const costExpenseLines: FinancialReportLine[] = [];
  const sums = new Map<string, { name: string; amount: number }>();

  const operatingEntries = input.entries.filter((entry) => !isPeriodClosingEntry(entry));

  for (const entry of operatingEntries) {
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
  const totals = summarizeProfitTotals(operatingEntries);

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
      // 所得税费用单列，前端才能解释「利润总额 → 净利润」之间的落差。
      incomeTax: formatAmount(totals.incomeTax),
      netProfit: formatAmount(totals.netProfit)
    }
  };
}

/**
 * 现金流量表 —— **不需要排除结转损益分录**，因为它们根本进不来。
 *
 * 判断依据：本函数按凭证分组，只处理含 1001/1002/1012 现金科目分录的凭证
 * （下方 `if (!cashEntries.length) continue`）。结转凭证只有 6xxx 与 3131 两侧，
 * 没有任何现金腿，必然被这一行跳过。这里刻意不加 `isPeriodClosingEntry` 过滤：
 * 加了是死代码，反而会让读者误以为现金流量表存在结转重复计量的风险。
 */
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
