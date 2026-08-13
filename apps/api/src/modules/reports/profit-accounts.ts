/**
 * 利润表科目口径的唯一事实来源（V8-B 任务 2）。
 *
 * 正式利润表（reports/summary.ts）与董事长驾驶舱（dashboard/summary.ts）此前
 * 各自维护一套科目口径：报表按 4 组收入前缀 + 7 组费用前缀汇总，驾驶舱却只认
 * `accountCode === "6001"` 与三个费用科目，导致同一期间同一份数据在 /home 与
 * /reports 上给出两个不同的「本月赚了多少」。
 *
 * 这里把口径抽成共用纯函数，两侧共同引用，杜绝再次漂移。金额符号约定：
 * - 收入类（贷方余额）：credit - debit，收入为正；
 * - 成本/费用类（借方余额）：debit - credit，支出为正。
 *
 * V8-P：分类改以科目主数据（accounts/chart-of-accounts.ts）的 `category` 字段为
 * 准，硬编码前缀表降级为科目表未命中时的兜底。此前的纯前缀表漏列了 `6602`
 * 等科目，classifyProfitAccount 返回 other 而 summarizeProfitTotals 对 other
 * 既不计收入也不计费用，费用被静默丢弃、利润虚高。
 */

import type { AccountCategory } from "../accounts/chart-of-accounts.js";
import { findChartAccount } from "../accounts/chart-of-accounts.js";

/** 收入类科目前缀（主营业务收入 / 其他业务收入 / 投资收益 / 营业外收入）。 */
export const REVENUE_ACCOUNT_PREFIXES = ["6001", "6051", "6111", "6301"] as const;

/**
 * 主营业务成本编码（国标 6401）。
 *
 * **V12-D3 之后这不再是「特例」。** 此前它是 `6001c`，落在收入 `6001` 的前缀里，
 * 于是每一处按前缀判定的地方都必须先把它排除掉——一条靠人记得的规则，漏一次
 * 就是主营业务成本被计成收入。现在 `6401` 与任何收入编码都没有前缀关系。
 *
 * 保留这个常量的理由变了：不是为了「排除」，而是因为利润表要把主营业务成本
 * 单列成 `cost` 一档来算毛利，而科目主数据的 `category` 只到 `expense` 粒度，
 * 区分不出这一档。这是一条正当的业务规则，不是编码冲突的补丁。
 */
export const MAIN_BUSINESS_COST_PREFIX = "6401";

/** 损益类科目的编码段。6 开头且不是收入的科目一律计入费用，杜绝静默漏算。 */
export const PROFIT_AND_LOSS_CODE_PREFIX = "6";

/** 所得税费用前缀，用于从费用中单独拆出税额。 */
export const INCOME_TAX_ACCOUNT_PREFIX = "6801";

export type ProfitAccountKind = "revenue" | "cost" | "expense" | "other";

interface AmountEntry {
  accountCode: string;
  debit: string;
  credit: string;
}

export interface ProfitTotals {
  revenue: number;
  cost: number;
  /**
   * 期间费用合计，**不含所得税费用**（6801 在 incomeTax 中单列）。
   * 与正式利润表「营业总成本」同口径：grossProfit - expense = totalProfit。
   */
  expense: number;
  /** 所得税费用（6801），只在净利润处扣减一次。 */
  incomeTax: number;
  grossProfit: number;
  /** 利润总额：按企业会计准则不扣除所得税费用。 */
  totalProfit: number;
  netProfit: number;
}

function hasPrefix(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

/**
 * 科目主数据的 category → 利润表口径。
 *
 * `cost`（生产成本 4001 / 制造费用 4101）归入 `other`：这两个科目要先结转到
 * 主营业务成本才进损益，直接计入利润表会重复计量。利润表的 `cost` 一档只服务
 * 主营业务成本 6401，由 classifyProfitAccount 单独判定。
 */
function fromAccountCategory(category: AccountCategory): ProfitAccountKind {
  if (category === "revenue") return "revenue";
  if (category === "expense") return "expense";
  return "other";
}

/**
 * 把科目代码归入利润表的收入 / 成本 / 费用 / 其他四类。
 *
 * 判定链：
 * 1. `6401*` → 成本。**V12-D3 之前这一档必须排在最前面**，因为当时主营业务成本
 *    编码是 `6001c`，会被下面的 `6001` 收入前缀吃掉。国标化之后 `6401` 与收入
 *    编码无任何前缀关系，这一档放哪都不影响正确性——它现在只是「毛利要单列
 *    成本」这条业务规则的落点。同理，此前还有一条 `6301e*` → 费用的前置分支，
 *    专为避开 `6301` 营业外收入而存在，现在管理费用是 `6602`，那一档已删除。
 * 2. 科目主数据 `category` 精确命中 → 权威分类。收入/费用直接采信，资产/负债/
 *    权益/成本类归 other。这一档取代了此前那张硬编码费用前缀表——前缀表漏了
 *    未列举的科目，导致费用被静默丢弃、利润虚高。
 * 3. 科目表未登记时的兜底：命中收入前缀 → 收入；否则只要是 6 开头 → 费用。
 *    兜底与资产负债表历史行为一致（非收入的 6 开头一律当费用），保证未登记科目
 *    与将来新增的子科目都不会从报表里消失。
 */
export function classifyProfitAccount(code: string): ProfitAccountKind {
  if (code.startsWith(MAIN_BUSINESS_COST_PREFIX)) return "cost";

  const account = findChartAccount(code);
  if (account) return fromAccountCategory(account.category);

  if (hasPrefix(code, REVENUE_ACCOUNT_PREFIXES)) return "revenue";
  if (code.startsWith(PROFIT_AND_LOSS_CODE_PREFIX)) return "expense";
  return "other";
}

export function isIncomeTaxAccount(code: string): boolean {
  return code.startsWith(INCOME_TAX_ACCOUNT_PREFIX);
}

function parseAmount(value: string | null | undefined): number {
  return Number(value || 0);
}

/**
 * 按利润表口径汇总一组分录。
 *
 * 企业会计准则口径（所得税费用 6801 只在净利润处扣一次）：
 *   营业收入 - 营业成本 - 期间费用等(不含 6801) = 利润总额
 *   利润总额 - 所得税费用(6801)               = 净利润
 *
 * 此前 expense 含 6801，totalProfit 减了一次含税的 expense，netProfit 又减一次
 * incomeTax，导致有所得税分录时利润总额与净利润双双低估。现在 expense 在累加时
 * 就把 6801 排除在外，驾驶舱与 /reports 仍共用本函数，「费用」口径不会再分叉。
 */
export function summarizeProfitTotals(entries: readonly AmountEntry[]): ProfitTotals {
  let revenue = 0;
  let cost = 0;
  let expense = 0;
  let incomeTax = 0;

  for (const entry of entries) {
    const signed = parseAmount(entry.debit) - parseAmount(entry.credit);
    const kind = classifyProfitAccount(entry.accountCode);
    if (kind === "revenue") {
      revenue += -signed;
      continue;
    }
    if (kind === "cost") {
      cost += signed;
      continue;
    }
    if (kind === "expense") {
      if (isIncomeTaxAccount(entry.accountCode)) {
        incomeTax += signed;
        continue;
      }
      expense += signed;
    }
  }

  const grossProfit = revenue - cost;
  const totalProfit = grossProfit - expense;
  return {
    revenue,
    cost,
    expense,
    incomeTax,
    grossProfit,
    totalProfit,
    netProfit: totalProfit - incomeTax
  };
}
