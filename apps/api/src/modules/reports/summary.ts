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
import { RETAINED_EARNINGS_CODE } from "../ledger/account-semantics.js";
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
const PROFIT_ACCOUNT_CODE = "4103";

/** 金额比较容差。金额是 numeric(18,2)，半分钱的差已不可能来自正常数据。 */
const AMOUNT_EPSILON = 0.0001;

interface ProfitSplitInput {
  asOfDate: string;
  asOfEntries: readonly LedgerEntry[];
  /** 3131 账面余额（贷方为正）。 */
  profitAccountBalance: number;
  /** 3141 账面余额（贷方为正）。 */
  retainedAccountBalance: number;
  /** 尚未结转的损益净额，可能跨年（见 buildBalanceSheetReport 的互补关系说明）。 */
  unclosedProfit: number;
}

export interface ProfitSplit {
  /** 本财年利润，落在「本年利润」行。 */
  currentYear: number;
  /** 以前年度累计，落在「利润分配」行。 */
  retained: number;
}

/**
 * 把「本年利润 + 未分配利润」按财年切开。
 *
 * ## 为什么两个来源都要切
 *
 * 以前年度的利润会藏在两个地方，只处理一个都不够：
 *
 * 1. **3131 的账面余额**——往年做过月结但没做年结，利润结转进了 3131 就一直躺着；
 * 2. **往年尚未结转的损益**——往年连月结都没做，损益还留在 6xxx 上，
 *    被 `summarizeProfitTotals` 算进了 `unclosedProfit`。
 *
 * 只切第一个，一家从没做过月结的公司的往年利润仍会算进「本年」。
 *
 * ## 中国财年恒等于自然年
 *
 * 所以起始日是纯字符串运算（`YYYY-01-01`），不经 `Date` —— 经 `Date` 往返会在
 * 非 UTC 运行时把 1 月 1 日前移一天，把当年第一天的分录算成去年的。
 * 同一个理由见 ledger/fiscal-year.ts 与 db/date-column.ts。
 */
export function resolveProfitSplit(input: ProfitSplitInput): ProfitSplit {
  const fiscalYearStart = `${input.asOfDate.slice(0, 4)}-01-01`;
  const priorEntries = input.asOfEntries.filter((entry) => entry.entryDate < fiscalYearStart);

  // 3131 上属于以前年度的部分：贷方为正（权益类）
  const priorProfitAccount = priorEntries
    .filter((entry) => entry.accountCode === PROFIT_ACCOUNT_CODE)
    .reduce((sum, entry) => sum + parseAmount(entry.credit) - parseAmount(entry.debit), 0);

  // 以前年度尚未结转的损益。这里**沿用**含结转分录的口径（与 unclosedProfit 一致）：
  // 往年已结转的部分被结转分录冲平、净额为 0，剩下的正是往年还没结转的。
  const priorUnclosed = summarizeProfitTotals(priorEntries).netProfit;

  const priorYears = priorProfitAccount + priorUnclosed;

  return {
    currentYear: input.profitAccountBalance + input.unclosedProfit - priorYears,
    retained: input.retainedAccountBalance + priorYears
  };
}

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
  // 聚合时把科目的报表口径一起留住（V12 残留 7）：分类的事实来源是 accounts 表，
  // 聚合成 code → amount 就把它丢了，下面只能退回按编码猜。
  const balanceMap = new Map<string, { amount: number; category: LedgerEntry["accountCategory"] }>();
  for (const entry of asOfEntries) {
    const current = balanceMap.get(entry.accountCode);
    balanceMap.set(entry.accountCode, {
      amount: (current?.amount ?? 0) + parseAmount(entry.debit) - parseAmount(entry.credit),
      category: current?.category ?? entry.accountCategory
    });
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
  let hasRetainedAccountBalance = false;
  /** 3131 的账面余额（贷方为正）。 */
  let profitAccountBalance = 0;
  /** 3141 的账面余额（贷方为正）。 */
  let retainedAccountBalance = 0;

  // 每个科目都必须有明确去向（V12-A5 / 蓝图 E4）。此前这里是
  // `if 1 / else if 2 / else if 3` 且**没有 else**：4 开头的生产成本 4001 与
  // 制造费用 4101 既不进资产也不进负债权益，被静默丢弃，制造业客户的资产负债表
  // 直接不平。现在改用全函数 classifyBalanceSheetAccount，兜底走 unclassified
  // 并显式告警，不再有「掉到 else 外面」的可能。
  for (const [accountCode, { amount, category }] of balanceMap.entries()) {
    const section = classifyBalanceSheetAccount(accountCode, category);

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
      // 3131 与 3141 不在循环里成行：它们之间要做一次跨年重分类（见下方
      // resolveProfitSplit），在循环里各自 push 会让重分类无处落脚。
      if (accountCode === PROFIT_ACCOUNT_CODE) {
        hasProfitAccountBalance = true;
        profitAccountBalance = -amount;
      } else if (accountCode === RETAINED_EARNINGS_CODE) {
        hasRetainedAccountBalance = true;
        retainedAccountBalance = -amount;
      } else {
        equityLines.push({
          code: accountCode,
          label: accountCode,
          amount: formatAmount(-amount)
        });
      }
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

  // ── 本年利润 / 未分配利润的跨年重分类（V12 蓝图 E6）────────────────────
  //
  // 「本年利润」必须只含**本财年**的利润。漏做年末结转时，3131 上会累积着
  // 历年已结转的利润，报表就会把开业至今的累计数标成「本年利润」——数字看着
  // 合理，只是把三年的利润当成了今年赚的。
  //
  // 这是 Odoo 路线（见 ledger/fiscal-year.ts 头注）：**报表在任何时候都对，
  // 哪怕上年没做年结**。它与年结凭证路线并存，不替代后者——账簿上仍需要那张
  // 「借 3131 / 贷 3141」的凭证供审计查看。
  //
  // 重分类只在**权益内部**发生，权益合计分文不动，A = L + E 不受影响：
  // 从 3131 挪走多少，3141 就增加多少。
  const profitSplit = resolveProfitSplit({
    asOfDate: input.asOfDate,
    asOfEntries,
    profitAccountBalance,
    retainedAccountBalance,
    unclosedProfit: netProfit
  });

  if (hasProfitAccountBalance || Math.abs(profitSplit.currentYear) > AMOUNT_EPSILON) {
    equityLines.push({
      code: PROFIT_ACCOUNT_CODE,
      label: "本年利润",
      amount: formatAmount(profitSplit.currentYear)
    });
  }
  if (hasRetainedAccountBalance || Math.abs(profitSplit.retained) > AMOUNT_EPSILON) {
    equityLines.push({
      code: RETAINED_EARNINGS_CODE,
      label: "利润分配",
      amount: formatAmount(profitSplit.retained)
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
  const sums = new Map<
    string,
    { name: string; amount: number; category: LedgerEntry["accountCategory"] }
  >();

  const operatingEntries = input.entries.filter((entry) => !isPeriodClosingEntry(entry));

  for (const entry of operatingEntries) {
    const current = sums.get(entry.accountCode) || {
      name: entry.accountName,
      amount: 0,
      category: entry.accountCategory
    };
    current.amount += parseAmount(entry.debit) - parseAmount(entry.credit);
    sums.set(entry.accountCode, current);
  }

  for (const [code, { name, amount, category }] of sums.entries()) {
    const kind = classifyProfitAccount(code, category);
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
      hasPrefix(code, ["2001", "2401", "3001", "3002", "4104"])
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
