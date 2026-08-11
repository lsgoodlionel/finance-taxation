/**
 * 资产负债表恒等式自检（V12-B5 要求 4）。
 *
 * ## 为什么这东西必须存在
 *
 * ERPNext 的资产负债表在算完之后会实时求 `资产 − 负债 − 权益`，不为 0 就插一行
 * "Unclosed Fiscal Years Profit/Loss" 把差额显式列出来。这个设计的价值不在于
 * 「补平」，而在于**让「上年未结账」在报表上可见，而不是变成一个静默的错数**。
 *
 * FT 当前的缺陷正是静默：`generateClosingEntries` 每月往 3131 记贷方且从不清零，
 * 跑满一个自然年后资产负债表的「本年利润」行会显示历年累计数，没有任何提示。
 *
 * ## 差额一定等于未结转损益 —— 这是可以证明的，不是经验规律
 *
 * 复式记账保证全部分录的借方合计 = 贷方合计，即按 `balance = debit − credit` 求和
 * 覆盖所有科目恒等于 0：
 *
 * ```
 * Σ资产 + Σ负债 + Σ权益 + Σ损益 + Σ未分类 = 0
 * ```
 *
 * 按报表口径取号（负债/权益/损益取 `credit − debit`）后就是：
 *
 * ```
 * 资产 − 负债 − 权益 = 未结转损益 − 未分类余额
 * ```
 *
 * 所以：
 * - `difference` 与 `unclosedProfitLoss − unclassified` 相等 → 差额有解释，
 *   来源是「损益还没结转」（月结没做完，或年结没做）；
 * - 两者**不**相等（`residual ≠ 0`）→ 总账本身借贷不平，是真错账/脏数据，
 *   与结账无关。这一档比 ERPNext 的做法更进一步：它把「正常的未结转」和
 *   「真的不平了」区分开，不然用户看到一行差额也不知道该不该慌。
 */

import type { PoolClient } from "pg";
import { classifyBalanceSheetAccount } from "../reports/balance-sheet-accounts.js";
import { CURRENT_YEAR_PROFIT_CODE } from "./account-semantics.js";
import { fiscalYearProfitFilterSql, fiscalYearRange } from "./fiscal-year.js";

/** 判定「平」的容差。金额列是 numeric(18,2)，半分钱的误差不可能来自正常数据。 */
const TOLERANCE = 0.005;

export interface OpenFiscalYearProfit {
  year: number;
  /** 该财年内的损益净额（Odoo 路线口径：只取本财年、排除结转分录）。 */
  netProfit: number;
  /** 该财年末 3131 本年利润的累计账面余额（贷方为正）。 */
  currentYearProfitBalance: number;
}

export interface BalanceSheetCheck {
  asOfDate: string;
  assets: number;
  liabilities: number;
  equity: number;
  /** 尚未结转到权益的损益净额。差额的正常来源。 */
  unclosedProfitLoss: number;
  /** 归不到任何一档的科目余额（`debit − credit`）。正常应为 0。 */
  unclassified: number;
  /** `资产 − 负债 − 权益`。 */
  difference: number;
  /**
   * `difference − (unclosedProfitLoss − unclassified)`。
   * 恒等式保证它为 0；不为 0 说明总账借贷不平，是真错账。
   */
  residual: number;
  /** 恒等式成立（差额可被未结转损益完全解释）。 */
  balanced: boolean;
  /** 尚未做年末结转、且账上有损益的年度 —— 「上年未结账」的可见化。 */
  openFiscalYears: OpenFiscalYearProfit[];
  /** 给报表直接列示用的一句话，无异常时为 null。 */
  notice: string | null;
}

interface BalanceRow {
  account_code: string;
  category: string | null;
  balance: string;
}

/**
 * 计算截至 `asOfDate` 的资产负债表恒等式。
 *
 * 科目归类以 `accounts.category`（按公司隔离的主数据）为准，未登记的科目回退到
 * `reports/balance-sheet-accounts.ts` 的 `classifyBalanceSheetAccount`——那是资产
 * 负债表口径的单一事实来源，且它是**全函数**（对任意字符串都返回明确去向，
 * 归不了类的走 `unclassified` 而不是被静默丢弃）。这里不另起一套分类规则。
 */
export async function checkBalanceSheet(
  client: PoolClient,
  companyId: string,
  asOfDate: string
): Promise<BalanceSheetCheck> {
  const rows = await client.query<BalanceRow>(
    `select le.account_code, a.category, sum(le.debit - le.credit) as balance
     from ledger_entries le
     left join accounts a on a.company_id = le.company_id and a.code = le.account_code
     where le.company_id = $1 and le.entry_date <= $2::date
     group by le.account_code, a.category`,
    [companyId, asOfDate]
  );

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let profitAndLoss = 0;
  let unclassified = 0;

  for (const row of rows.rows) {
    const balance = Number(row.balance);
    const section = sectionOf(row.account_code, row.category);
    if (section === "asset") assets += balance;
    else if (section === "liability") liabilities += -balance;
    else if (section === "equity") equity += -balance;
    else if (section === "profitAndLoss") profitAndLoss += -balance;
    else unclassified += balance;
  }

  const difference = assets - liabilities - equity;
  const residual = difference - (profitAndLoss - unclassified);
  const balanced = Math.abs(difference) <= TOLERANCE;

  const openFiscalYears = await findOpenFiscalYearProfits(client, companyId, asOfDate);

  return {
    asOfDate,
    assets: round(assets),
    liabilities: round(liabilities),
    equity: round(equity),
    unclosedProfitLoss: round(profitAndLoss),
    unclassified: round(unclassified),
    difference: round(difference),
    residual: round(residual),
    balanced,
    openFiscalYears,
    notice: buildNotice({
      difference: round(difference),
      residual: round(residual),
      unclassified: round(unclassified),
      openFiscalYears
    })
  };
}

/** `accounts.category` 优先，未登记科目回退到报表口径的全函数分类。 */
function sectionOf(accountCode: string, category: string | null) {
  switch (category) {
    case "asset":
    // 生产成本 4001 / 制造费用 4101 的期末余额即在产品，属存货 → 资产。
    // 与 reports/balance-sheet-accounts.ts 同口径。
    case "cost":
      return "asset" as const;
    case "liability":
      return "liability" as const;
    case "equity":
      return "equity" as const;
    case "revenue":
    case "expense":
      return "profitAndLoss" as const;
    default:
      return classifyBalanceSheetAccount(accountCode);
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 尚未年结、且账上有损益或 3131 余额的年度。
 *
 * `netProfit` 走 Odoo 路线取数（只取本财年内、排除结转分录），所以**即使忘了做
 * 年结这个数字也是对的** —— 这正是要让报表能显示的东西。
 */
async function findOpenFiscalYearProfits(
  client: PoolClient,
  companyId: string,
  asOfDate: string
): Promise<OpenFiscalYearProfit[]> {
  // 年份从**账务活动**里推，而不是从 fiscal_years 表里取。
  //
  // 自检的全部意义是把「这一年没结账」暴露出来，而 fiscal_years 的行是按需补建的
  // —— 若某年从来没人打开过年结页面，它就没有行。以表为准会让最该被提醒的那种
  // 情况（用户压根没意识到要年结）恰好什么都不显示。
  const years = await client.query<{ year: number }>(
    `select distinct extract(year from le.entry_date)::int as year
     from ledger_entries le
     left join fiscal_years fy
       on fy.company_id = le.company_id
      and fy.year = extract(year from le.entry_date)::int
     where le.company_id = $1 and le.entry_date <= $2::date
       and coalesce(fy.status, 'open') <> 'closed'
     order by year`,
    [companyId, asOfDate]
  );

  const result: OpenFiscalYearProfit[] = [];
  for (const { year } of years.rows) {
    const { startDate, endDate } = fiscalYearRange(Number(year));
    const cap = endDate < asOfDate ? endDate : asOfDate;

    // 谓词来自 fiscal-year.ts 的 Odoo 路线口径，不在这里另写一份 ——
    // 两处各自维护「本财年内 + 排除结转」的规则，迟早会漂移。
    const profit = await client.query<{ net: string }>(
      `select coalesce(sum(le.credit - le.debit), 0) as net
       from ledger_entries le
       left join accounts a on a.company_id = le.company_id and a.code = le.account_code
       where le.company_id = $1
         and ${fiscalYearProfitFilterSql("$2", "$3", "le")}
         and (a.category in ('revenue', 'expense') or (a.category is null and le.account_code like '6%'))`,
      [companyId, startDate, cap]
    );

    const carried = await client.query<{ balance: string }>(
      `select coalesce(sum(credit - debit), 0) as balance
       from ledger_entries
       where company_id = $1 and account_code = $2 and entry_date <= $3::date`,
      [companyId, CURRENT_YEAR_PROFIT_CODE, cap]
    );

    const netProfit = round(Number(profit.rows[0]?.net ?? 0));
    const currentYearProfitBalance = round(Number(carried.rows[0]?.balance ?? 0));
    if (Math.abs(netProfit) <= TOLERANCE && Math.abs(currentYearProfitBalance) <= TOLERANCE) {
      continue;
    }
    result.push({ year: Number(year), netProfit, currentYearProfitBalance });
  }
  return result;
}

function buildNotice(input: {
  difference: number;
  residual: number;
  unclassified: number;
  openFiscalYears: readonly OpenFiscalYearProfit[];
}): string | null {
  const parts: string[] = [];
  if (Math.abs(input.residual) > TOLERANCE) {
    parts.push(
      `总账借贷不平 ${input.residual.toFixed(2)} 元 —— 这不是未结转造成的差额，` +
        `请核对分录数据。`
    );
  }
  if (Math.abs(input.difference) > TOLERANCE) {
    parts.push(
      `资产 − 负债 − 所有者权益 = ${input.difference.toFixed(2)} 元，来源是尚未结转的损益。`
    );
  }
  if (input.openFiscalYears.length > 0) {
    const years = input.openFiscalYears.map((item) => `${item.year} 年`).join("、");
    parts.push(`${years}尚未做年末结转，本年利润未转入利润分配。`);
  }
  if (Math.abs(input.unclassified) > TOLERANCE) {
    parts.push(
      `有 ${input.unclassified.toFixed(2)} 元挂在无法归类的科目上，请检查科目表是否缺项。`
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
