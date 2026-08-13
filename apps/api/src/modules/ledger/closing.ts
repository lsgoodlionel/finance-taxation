/**
 * Period-end income-summary closing (结转损益).
 *
 * Generates the balanced voucher that clears profit-and-loss accounts (6xxx)
 * into 本年利润 (current-year profit, account 3131), so the ledger balances
 * through real closing entries instead of the application-layer plug currently
 * injected by reports/summary.ts. Pure and side-effect free: callers persist the
 * returned lines as a normal voucher.
 *
 * Balance convention matches reports/summary balanceMap: `balance = debit − credit`.
 * Revenue accounts carry a net credit (negative balance); expenses a net debit.
 *
 * 收入/费用的判定复用 reports/profit-accounts.ts（利润表口径的唯一事实来源），
 * 保证结转进 3131 的金额与利润表 netProfit 逐分相等。
 */

import { classifyProfitAccount } from "../reports/profit-accounts.js";

/** Current-year profit account that P&L is closed into. */
export const PROFIT_ACCOUNT = "4103";

const EPSILON = 0.0001;

export interface AccountBalance {
  accountCode: string;
  /** debit − credit for the account as of the closing date. */
  balance: number;
}

export interface ClosingLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface ClosingResult {
  lines: ClosingLine[];
  /** Revenue − expense. Positive is profit, negative is loss. */
  netProfit: number;
}

export function generateClosingEntries(balances: readonly AccountBalance[]): ClosingResult {
  const lines: ClosingLine[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const { accountCode, balance } of balances) {
    if (Math.abs(balance) < EPSILON) {
      continue;
    }
    // 分类口径与利润表共用 classifyProfitAccount（V8-P 起以科目主数据为准，6 开头
    // 未登记科目兜底为费用）。此前这里自带一套「精确匹配 4 个收入科目、其余 6xxx
    // 一律费用」的平行规则：未登记的收入子科目（如 6001001）在利润表算收入、在
    // 结转损益却算费用，同一期间利润表净利润 ≠ 资产负债表本年利润。
    const kind = classifyProfitAccount(accountCode);
    if (kind === "other") {
      // 非损益科目（资产/负债/权益，以及需先结转到主营业务成本的 4001/4101）不参与结转。
      continue;
    }
    if (kind === "revenue") {
      // Revenue: net credit of (−balance). Close by debiting the account.
      const revenue = -balance;
      totalRevenue += revenue;
      lines.push({ accountCode, debit: revenue, credit: 0 });
      continue;
    }
    // 成本与费用（含所得税费用）：net debit of balance. Close by crediting the account.
    totalExpense += balance;
    lines.push({ accountCode, debit: 0, credit: balance });
  }

  const netProfit = totalRevenue - totalExpense;
  if (lines.length > 0 && Math.abs(netProfit) >= EPSILON) {
    // Balancing leg into 本年利润: credit on profit, debit on loss.
    lines.push({
      accountCode: PROFIT_ACCOUNT,
      debit: netProfit < 0 ? -netProfit : 0,
      credit: netProfit > 0 ? netProfit : 0
    });
  }

  return { lines, netProfit };
}
