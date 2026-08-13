/**
 * 科目余额表 / 试算平衡表（V12-B6 / 蓝图 F3）—— 纯计算层。
 *
 * ## 为什么单独有这张表
 *
 * 它是中国会计师每天要看的那张表，用友/金蝶都放在首页，使用频率高于资产负债表。
 * 而它同时是**试算平衡**的载体：FT 每张凭证过账时校验借贷相等（迁移 047 之后这条
 * 约束还下沉到了数据库），理论上总账恒平——但在此之前系统里没有任何地方把这个
 * 恒等式打印出来。审计要的就是这张纸。
 *
 * 正因为理论上恒平，差额非零就意味着「某处出了本不该出的事」，所以本模块把三组
 * 借贷合计与各自的差额都显式输出，并在非零时给出告警，而不是让使用者自己去加。
 *
 * ## 六栏的取数口径
 *
 * | 栏目           | 区间                                    |
 * |----------------|-----------------------------------------|
 * | 期初借 / 期初贷 | 见下「期初口径」                        |
 * | 本期借 / 本期贷 | `entry_date` ∈ [期初日, 期末日]         |
 * | 期末借 / 期末贷 | 期初 + 本期发生                         |
 *
 * 期初/期末是**余额**：先算净额（借 − 贷），净额为正列借方、为负列贷方，另一栏为 0。
 * 必须按净额符号而非科目方向来分栏——「Σ期末借方 = Σ期末贷方」这个试算平衡恒等式
 * 只在符号规则下成立，按科目预设方向分栏时一个红字余额就会把恒等式打破。
 *
 * ## 期初口径：损益类按财年起算
 *
 * 资产/负债/权益/成本类的期初 = **建库至今**的累计（余额跨年结转）。
 * 损益类（收入/费用）的期初 = **本财年内**的累计（年结后损益归零，不跨年结转）。
 *
 * 对应 ERPNext 的 `show_unclosed_fy_pl_balances`。若上一财年的损益尚未结平，
 * 财年口径会把那部分残余排除在期初之外，期初/期末两组合计因此可能不相等——
 * 这不是账错了，而是「上年损益未结转」的信号，故本模块把该残余单独算出来并在
 * 告警里点名，而不是让使用者面对一个无法解释的差额。
 *
 * ## 结转分录必须包含
 *
 * 本表**不按 `source` 做任何排除**。口径依据见 ledger/closing-entries.ts：
 * 账簿列示（总账、明细账、科目余额）不得排除结转分录，藏起来会让账簿不完整、
 * 也对不上试算平衡；正因为包含它们，结转后 6xxx 归零、3131 承载本年利润这一
 * 正确结果才能在表上呈现。这条对期末结转（`period_closing`）成立，对将来新增的
 * 系统分录（期初建账、年结）同样成立——它们都是真实的账簿内容。
 */

import { classifyBalanceSheetAccount } from "./balance-sheet-accounts.js";
import { fromCents, toCents } from "../../utils/money.js";

/** 一个科目在本期的原始聚合结果（由 SQL 一次算出，见 trial-balance.routes.ts）。 */
export interface TrialBalanceAggregate {
  accountCode: string;
  accountName: string;
  /** 科目主数据的报表口径；科目表未登记该编码时为 null。 */
  category: string | null;
  /** 该编码是否登记在 `accounts` 科目表里。 */
  isRegistered: boolean;
  isActive: boolean;
  /** 建库至今、期初日之前的累计借方 / 贷方。 */
  inceptionOpeningDebit: string;
  inceptionOpeningCredit: string;
  /** 财年起点至期初日之前的累计借方 / 贷方。 */
  fiscalOpeningDebit: string;
  fiscalOpeningCredit: string;
  periodDebit: string;
  periodCredit: string;
}

export type OpeningBasis = "inception" | "fiscal_year";

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  category: string | null;
  /** 该行期初栏用的是哪种口径，前端可据此加脚注。 */
  openingBasis: OpeningBasis;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  /** false 表示账上有这个编码、科目表里却没有——数据完整性问题，须人工介入。 */
  isRegistered: boolean;
  /** 六栏是否全为 0（无期初、本期无发生）。 */
  isEmpty: boolean;
}

export interface TrialBalanceColumnTotals {
  debit: string;
  credit: string;
  /** 借 − 贷。非零即异常。 */
  difference: string;
  isBalanced: boolean;
}

export interface TrialBalanceTotals {
  opening: TrialBalanceColumnTotals;
  period: TrialBalanceColumnTotals;
  closing: TrialBalanceColumnTotals;
}

export interface TrialBalanceReport {
  period: string;
  startDate: string;
  endDate: string;
  fiscalYearStart: string;
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  /** 三组合计全部借贷相等才为 true。 */
  isBalanced: boolean;
  warnings: string[];
  total: number;
}

export interface BuildTrialBalanceInput {
  period: string;
  startDate: string;
  endDate: string;
  fiscalYearStart: string;
  accounts: TrialBalanceAggregate[];
}

/**
 * 平衡判定不留容差。
 *
 * 金额列是 `numeric(18,2)`，本模块全程按整数分累加（见 `toCents`），不存在浮点漂移，
 * 也就没有「差一分是舍入误差还是真错账」的模糊地带。留容差只会让这张探针表把
 * 小额错账吞掉——而小额错账正是最难靠肉眼发现的那一类。
 */
const BALANCED_TOLERANCE_CENTS = 0;

/**
 * 该科目的期初是否按财年起算。
 *
 * 优先信科目主数据的 `category`（用户可自建科目，主数据才是权威）；未登记时退回
 * A5 的 `classifyBalanceSheetAccount` 编码兜底，两者口径一致：只有归入
 * `profitAndLoss` 的收入/费用类不跨年结转，成本类（4001/4101 期末即在产品，属存货）
 * 与资产/负债/权益一样跨年结转。
 */
export function resolveOpeningBasis(
  accountCode: string,
  category: string | null
): OpeningBasis {
  if (category === "revenue" || category === "expense") return "fiscal_year";
  if (category) return "inception";
  return classifyBalanceSheetAccount(accountCode) === "profitAndLoss"
    ? "fiscal_year"
    : "inception";
}

/**
 * 财年起点。
 *
 * 固定取自然年 1 月 1 日。这不是权宜之计：中国财年恒等于自然年，V12-B5 的
 * `fiscal_years` 表用 `check (start_date = make_date(year, 1, 1))` 把这一点钉成了
 * 数据库约束，`ledger/fiscal-year.ts` 的 `fiscalYearRange()` 给出的也是同一个值。
 *
 * 之所以在本模块保留一份而不是直接调用它：B6 与 B5 是并行的两条车道，报表侧不该
 * 在 B5 落地前就硬依赖它的模块。两条都合入后，这里应当收敛成调用 `fiscalYearRange`，
 * 届时删掉本函数即可——语义完全一致，不存在行为差异。对应断言见 trial-balance.test.ts。
 */
export function resolveFiscalYearStart(period: string): string {
  return `${period.slice(0, 4)}-01-01`;
}

/** `YYYY-MM` → 该月的首末日。 */
export function resolvePeriodRange(period: string): { startDate: string; endDate: string } {
  const [year, month] = period.split("-").map(Number);
  return {
    startDate: `${period}-01`,
    // 下个月的第 0 天即本月最后一天。
    endDate: new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)
  };
}

interface RowCents {
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

/** 净额 → 借/贷两栏。净额为正列借方，为负列贷方，另一栏恒为 0。 */
function splitBySign(netCents: number): { debit: number; credit: number } {
  return netCents >= 0 ? { debit: netCents, credit: 0 } : { debit: 0, credit: -netCents };
}

function computeRowCents(
  aggregate: TrialBalanceAggregate,
  basis: OpeningBasis
): RowCents {
  const openingDebitRaw = toCents(
    basis === "fiscal_year" ? aggregate.fiscalOpeningDebit : aggregate.inceptionOpeningDebit
  );
  const openingCreditRaw = toCents(
    basis === "fiscal_year" ? aggregate.fiscalOpeningCredit : aggregate.inceptionOpeningCredit
  );
  const periodDebit = toCents(aggregate.periodDebit);
  const periodCredit = toCents(aggregate.periodCredit);

  const opening = splitBySign(openingDebitRaw - openingCreditRaw);
  const closing = splitBySign(openingDebitRaw - openingCreditRaw + periodDebit - periodCredit);

  return {
    openingDebit: opening.debit,
    openingCredit: opening.credit,
    periodDebit,
    periodCredit,
    closingDebit: closing.debit,
    closingCredit: closing.credit
  };
}

function columnTotals(debitCents: number, creditCents: number): TrialBalanceColumnTotals {
  const difference = debitCents - creditCents;
  return {
    debit: fromCents(debitCents),
    credit: fromCents(creditCents),
    difference: fromCents(difference),
    isBalanced: Math.abs(difference) <= BALANCED_TOLERANCE_CENTS
  };
}

/**
 * 上一财年未结平的损益残余 = Σ损益科目（建库至今口径期初净额 − 财年口径期初净额）。
 *
 * 它恰好是「财年口径把期初合计打破」的那一块。单独算出来是为了让告警能给出可执行
 * 的解释，而不是只报一个差额数字。
 */
function unclosedPriorFiscalYearProfitCents(
  aggregates: ReadonlyArray<{ aggregate: TrialBalanceAggregate; basis: OpeningBasis }>
): number {
  return aggregates
    .filter((item) => item.basis === "fiscal_year")
    .reduce((sum, item) => {
      const inceptionNet =
        toCents(item.aggregate.inceptionOpeningDebit) - toCents(item.aggregate.inceptionOpeningCredit);
      const fiscalNet =
        toCents(item.aggregate.fiscalOpeningDebit) - toCents(item.aggregate.fiscalOpeningCredit);
      return sum + inceptionNet - fiscalNet;
    }, 0);
}

function buildWarnings(input: {
  totals: TrialBalanceTotals;
  unregistered: TrialBalanceRow[];
  priorFiscalYearResidualCents: number;
}): string[] {
  const warnings: string[] = [];

  if (input.unregistered.length > 0) {
    warnings.push(
      `有 ${input.unregistered.length} 个科目出现在总账里、却未登记在科目表中（` +
        `${input.unregistered.map((row) => row.accountCode).join("、")}）。` +
        `它们的金额已如实计入本表合计，但缺少主数据意味着报表归类只能靠编码兜底，请补登记。`
    );
  }

  // 差额非零是「探针报警」而不是「表算错了」：借贷平衡在过账路径与数据库约束
  // （迁移 047）两处都有保障，所以走到这里说明有分录绕过了它们，须立即人工核查。
  if (!input.totals.period.isBalanced) {
    warnings.push(
      `本期发生额借贷不平：借方 ${input.totals.period.debit}，贷方 ${input.totals.period.credit}，` +
        `差额 ${input.totals.period.difference}。总账借贷平衡在数据库层已有约束，出现差额说明存在绕过写入，请立即核查。`
    );
  }

  if (!input.totals.opening.isBalanced || !input.totals.closing.isBalanced) {
    const residual = input.priorFiscalYearResidualCents;
    const explanation =
      residual !== 0
        ? `其中 ${fromCents(residual)} 来自上一财年未结转的损益余额——损益类期初按财年起算，` +
          `该部分被排除在期初之外。执行上年度的期末结转即可消除。`
        : `期初按「资产负债类建库至今、损益类本财年内」口径取数，出现差额说明账簿存在不平的历史分录，请核查。`;
    warnings.push(
      `期初余额借贷不平：借方 ${input.totals.opening.debit}，贷方 ${input.totals.opening.credit}，` +
        `差额 ${input.totals.opening.difference}。${explanation}`
    );
  }

  return warnings;
}

/**
 * 由每科目一行的聚合结果装配试算平衡表。
 *
 * 入参已经是「一科目一行」，聚合在 SQL 里完成（见 trial-balance.routes.ts），
 * 本函数只做分栏、合计与告警，规模是科目数而非分录数。
 */
export function buildTrialBalance(input: BuildTrialBalanceInput): TrialBalanceReport {
  const withBasis = input.accounts.map((aggregate) => ({
    aggregate,
    basis: resolveOpeningBasis(aggregate.accountCode, aggregate.category)
  }));

  const allRows: TrialBalanceRow[] = withBasis.map(({ aggregate, basis }) => {
    const cents = computeRowCents(aggregate, basis);
    const isEmpty = Object.values(cents).every((value) => value === 0);
    return {
      accountCode: aggregate.accountCode,
      accountName: aggregate.accountName,
      category: aggregate.category,
      openingBasis: basis,
      openingDebit: fromCents(cents.openingDebit),
      openingCredit: fromCents(cents.openingCredit),
      periodDebit: fromCents(cents.periodDebit),
      periodCredit: fromCents(cents.periodCredit),
      closingDebit: fromCents(cents.closingDebit),
      closingCredit: fromCents(cents.closingCredit),
      isRegistered: aggregate.isRegistered,
      isEmpty
    };
  });

  // 启用中的科目即使本期毫无发生额也要列出——科目余额表是「以科目表为骨架」的，
  // 少了空行会让使用者以为科目不存在。已停用且六栏全零的科目才隐藏。
  const rows = allRows.filter((row, index) => {
    const isActive = withBasis[index]!.aggregate.isActive;
    return !row.isEmpty || isActive;
  });

  const sum = (pick: (row: TrialBalanceRow) => string): number =>
    rows.reduce((total, row) => total + toCents(pick(row)), 0);

  const totals: TrialBalanceTotals = {
    opening: columnTotals(sum((r) => r.openingDebit), sum((r) => r.openingCredit)),
    period: columnTotals(sum((r) => r.periodDebit), sum((r) => r.periodCredit)),
    closing: columnTotals(sum((r) => r.closingDebit), sum((r) => r.closingCredit))
  };

  const warnings = buildWarnings({
    totals,
    unregistered: rows.filter((row) => !row.isRegistered),
    priorFiscalYearResidualCents: unclosedPriorFiscalYearProfitCents(withBasis)
  });

  return {
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
    fiscalYearStart: input.fiscalYearStart,
    rows,
    totals,
    isBalanced:
      totals.opening.isBalanced && totals.period.isBalanced && totals.closing.isBalanced,
    warnings,
    total: rows.length
  };
}
