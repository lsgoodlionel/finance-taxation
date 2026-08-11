import type { PoolClient } from "pg";
import { generateClosingEntries, PROFIT_ACCOUNT, type AccountBalance } from "./closing.js";
import { checkPostable, insertLedgerEntries } from "../vouchers/ledger-writer.js";
import { resolveVoucherWord } from "../vouchers/voucher-number.js";

/**
 * 期末结转被账务闸门拦下。调用方（月结路由）应把它转成对用户可读的错误，
 * 而不是让整个月结流程静默失败。
 */
export class PeriodClosingBlockedError extends Error {
  constructor(
    readonly code: "VOUCHER_NOT_BALANCED" | "PERIOD_LOCKED",
    message: string
  ) {
    super(message);
    this.name = "PeriodClosingBlockedError";
  }
}

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

  // ⚠️ 这里**必须包含**历史结转分录，不要加 EXCLUDE_PERIOD_CLOSING_SQL。
  //
  // 本查询取的是 6xxx 截至 asOfDate 的**累计**余额。往期已结转的部分早被往期的
  // 结转分录冲平，所以累计余额剩下的恰好就是「本期尚未结转的发生额」——这正是
  // 本次要结转的金额。若在此排除结转分录，累计余额会退回「开业至今全部损益」，
  // 于是第二个月开始每次月结都会把此前所有期间重复结转一遍，3131 逐月翻倍。
  //
  // 与损益聚合读路径的区别在于：那些路径问的是「这一期赚了多少」（结转分录是
  // 重复计量，必须排除），本查询问的是「还有多少没结转」（结转分录是必要的扣减项）。
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

  // 账务闸门与普通过账走同一个函数（vouchers/ledger-writer.ts）。
  // 此前这里直接 insert，绕过了借贷平衡校验和**期间锁**——也就是说可以对一个
  // 已锁账的期间做结转。职责分离不在这里判：它管的是人的动作，而期末结转是系统
  // 按月自动生成的，没有真人可填。
  // ClosingLine 的金额是 number，而闸门与写入口用字符串——与 numeric(18,2) 列
  // 一致，避免浮点在边界上抖动。toFixed(2) 是这里唯一的转换点。
  const postingLines = lines.map((line) => ({
    debit: line.debit.toFixed(2),
    credit: line.credit.toFixed(2)
  }));
  const postable = await checkPostable(client, {
    companyId,
    accountingDate: asOfDate,
    lines: postingLines
  });
  if (!postable.ok) {
    throw new PeriodClosingBlockedError(postable.code, postable.message);
  }

  await client.query(
    `insert into vouchers (
       id, company_id, voucher_type, summary, status, source,
       accounting_date, period, voucher_word, voucher_seq,
       posted_at, created_at, updated_at
     )
     values (
       $1, $2, 'closing', $3, 'posted', 'period_closing',
       $5::date, $6, $7,
       coalesce(
         (select max(v2.voucher_seq) + 1 from vouchers v2
          where v2.company_id = $2 and v2.period = $6 and v2.voucher_word = $7
            and v2.status = 'posted'),
         1
       ),
       $4::timestamptz, now(), now()
     )`,
    [
      voucherId,
      companyId,
      `期末结转损益 ${periodLabel}`,
      now,
      asOfDate,
      periodLabel,
      resolveVoucherWord("closing")
    ]
  );

  const entries = [];
  for (const line of lines) {
    const accountName = await lookupAccountName(client, companyId, line.accountCode);
    entries.push({
      id: `led-close-${voucherId}-${line.accountCode}`,
      companyId,
      voucherId,
      businessEventId: null,
      entryDate: asOfDate,
      summary: `期末结转 ${periodLabel}`,
      accountCode: line.accountCode,
      accountName,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
      source: "period_closing" as const,
      postedAt: now
    });
  }
  await insertLedgerEntries(client, entries);

  await client.query(
    `insert into period_closings (id, company_id, period_label, voucher_id, net_profit)
     values ($1, $2, $3, $4, $5::numeric)`,
    [`pc-${companyId}-${periodLabel}`, companyId, periodLabel, voucherId, netProfit]
  );

  return { alreadyClosed: false, voucherId, netProfit, lineCount: lines.length };
}
