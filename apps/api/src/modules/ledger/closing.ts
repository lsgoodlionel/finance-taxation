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
 */

/** Current-year profit account that P&L is closed into. */
export const PROFIT_ACCOUNT = "3131";

/** Revenue accounts within the 6xxx range; every other 6xxx code is an expense. */
const REVENUE_ACCOUNTS = new Set(["6001", "6051", "6111", "6301"]);

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

function isProfitAndLoss(accountCode: string): boolean {
  return accountCode.startsWith("6");
}

export function generateClosingEntries(balances: readonly AccountBalance[]): ClosingResult {
  const lines: ClosingLine[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const { accountCode, balance } of balances) {
    if (!isProfitAndLoss(accountCode) || Math.abs(balance) < EPSILON) {
      continue;
    }
    if (REVENUE_ACCOUNTS.has(accountCode)) {
      // Revenue: net credit of (−balance). Close by debiting the account.
      const revenue = -balance;
      totalRevenue += revenue;
      lines.push({ accountCode, debit: revenue, credit: 0 });
    } else {
      // Expense: net debit of balance. Close by crediting the account.
      totalExpense += balance;
      lines.push({ accountCode, debit: 0, credit: balance });
    }
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
