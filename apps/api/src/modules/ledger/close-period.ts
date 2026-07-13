import type { PoolClient } from "pg";
import { generateClosingEntries, PROFIT_ACCOUNT, type AccountBalance } from "./closing.js";

/**
 * Persist the period-end income-summary closing voucher (结转损益) into the real
 * vouchers + ledger_entries tables, idempotently per (company, period).
 *
 * Once posted, revenue/expense accounts net to zero and 本年利润 (3131) carries
 * the real profit, so the balance sheet balances through actual entries instead
 * of the application-layer plug in reports/summary.ts. Must run inside a
 * transaction (pass the PoolClient from withTransaction).
 */

export interface ClosePeriodInput {
  companyId: string;
  /** Period key, e.g. "2026-05". */
  periodLabel: string;
  /** Inclusive close date; entries on/before it are included, e.g. "2026-05-31". */
  asOfDate: string;
  /** ISO timestamp for posted_at (injected for determinism/testability). */
  now: string;
}

export interface ClosePeriodResult {
  alreadyClosed: boolean;
  voucherId: string | null;
  netProfit: number;
  lineCount: number;
}

async function lookupAccountName(
  client: PoolClient,
  companyId: string,
  accountCode: string
): Promise<string> {
  if (accountCode === PROFIT_ACCOUNT) {
    return "本年利润";
  }
  const result = await client.query<{ account_name: string }>(
    `select account_name from ledger_entries
     where company_id = $1 and account_code = $2
     order by posted_at desc limit 1`,
    [companyId, accountCode]
  );
  return result.rows[0]?.account_name ?? accountCode;
}

export async function closePeriod(
  client: PoolClient,
  input: ClosePeriodInput
): Promise<ClosePeriodResult> {
  const { companyId, periodLabel, asOfDate, now } = input;

  const existing = await client.query<{ voucher_id: string; net_profit: string }>(
    `select voucher_id, net_profit from period_closings
     where company_id = $1 and period_label = $2`,
    [companyId, periodLabel]
  );
  const existingRow = existing.rows[0];
  if (existingRow) {
    return {
      alreadyClosed: true,
      voucherId: existingRow.voucher_id,
      netProfit: Number(existingRow.net_profit),
      lineCount: 0
    };
  }

  const balanceResult = await client.query<{ account_code: string; balance: string }>(
    `select account_code, sum(debit - credit) as balance
     from ledger_entries
     where company_id = $1 and account_code like '6%' and entry_date <= $2::date
     group by account_code`,
    [companyId, asOfDate]
  );
  const balances: AccountBalance[] = balanceResult.rows.map((row) => ({
    accountCode: row.account_code,
    balance: Number(row.balance)
  }));

  const { lines, netProfit } = generateClosingEntries(balances);
  if (lines.length === 0) {
    return { alreadyClosed: false, voucherId: null, netProfit: 0, lineCount: 0 };
  }

  const voucherId = `vch-close-${companyId}-${periodLabel}`;
  await client.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, posted_at, created_at, updated_at)
     values ($1, $2, 'closing', $3, 'posted', 'period_closing', $4::timestamptz, now(), now())`,
    [voucherId, companyId, `期末结转损益 ${periodLabel}`, now]
  );

  for (const line of lines) {
    const accountName = await lookupAccountName(client, companyId, line.accountCode);
    await client.query(
      `insert into ledger_entries
        (id, company_id, voucher_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at)
       values ($1, $2, $3, $4::date, $5, $6, $7, $8::numeric, $9::numeric, 'period_closing', $10::timestamptz)`,
      [
        `led-close-${voucherId}-${line.accountCode}`,
        companyId,
        voucherId,
        asOfDate,
        `期末结转 ${periodLabel}`,
        line.accountCode,
        accountName,
        line.debit,
        line.credit,
        now
      ]
    );
  }

  await client.query(
    `insert into period_closings (id, company_id, period_label, voucher_id, net_profit)
     values ($1, $2, $3, $4, $5::numeric)`,
    [`pc-${companyId}-${periodLabel}`, companyId, periodLabel, voucherId, netProfit]
  );

  return { alreadyClosed: false, voucherId, netProfit, lineCount: lines.length };
}
