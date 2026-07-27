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
 */

/** 收入类科目前缀（主营业务收入 / 其他业务收入 / 投资收益 / 营业外收入）。 */
export const REVENUE_ACCOUNT_PREFIXES = ["6001", "6051", "6111", "6301"] as const;

/** 主营业务成本前缀（本系统以 6001c 表示，与收入 6001 前缀重叠，需先排除）。 */
export const COST_ACCOUNT_PREFIX = "6001c";

/** 营业外支出前缀（与营业外收入 6301 前缀重叠，需先排除）。 */
export const NON_OPERATING_EXPENSE_PREFIX = "6301e";

/** 成本费用类科目前缀（含所得税费用 6801）。 */
export const EXPENSE_ACCOUNT_PREFIXES = [
  "6101",
  "6201",
  NON_OPERATING_EXPENSE_PREFIX,
  "6401",
  "6601",
  "6711",
  "6801"
] as const;

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
  /** 成本费用合计（含所得税费用，与正式利润表 totals.expenses 同口径）。 */
  expense: number;
  incomeTax: number;
  grossProfit: number;
  totalProfit: number;
  netProfit: number;
}

function hasPrefix(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

/** 把科目代码归入利润表的收入 / 成本 / 费用 / 其他四类。 */
export function classifyProfitAccount(code: string): ProfitAccountKind {
  if (code.startsWith(COST_ACCOUNT_PREFIX)) return "cost";
  if (code.startsWith(NON_OPERATING_EXPENSE_PREFIX)) return "expense";
  if (hasPrefix(code, REVENUE_ACCOUNT_PREFIXES)) return "revenue";
  if (hasPrefix(code, EXPENSE_ACCOUNT_PREFIXES)) return "expense";
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
 * netProfit 沿用正式利润表既有算式（totalProfit - incomeTax），确保驾驶舱与
 * /reports 对同一份数据得到完全相同的净利润；两处口径不再各自演化。
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
      expense += signed;
      if (isIncomeTaxAccount(entry.accountCode)) {
        incomeTax += signed;
      }
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
