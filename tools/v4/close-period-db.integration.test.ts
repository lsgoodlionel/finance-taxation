import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { closePeriod } from "../../apps/api/src/modules/ledger/close-period.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const COMPANY = "cmp-close-test";
const PERIOD = "2026-05";
const AS_OF = "2026-05-31";
const NOW = "2026-05-31T23:59:59.000Z";

const pool = new pg.Pool({ connectionString: databaseUrl });

async function seed() {
  await cleanup();
  await pool.query("insert into companies (id, name) values ($1, '结转测试公司')", [COMPANY]);
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, posted_at)
     values ('vch-src-close', $1, 'analysis', '收入费用源凭证', 'posted', 'seed', $2::timestamptz)`,
    [COMPANY, NOW]
  );
  // Revenue 6001: credit 1000 (net credit). Expense 6601: debit 400 (net debit). Net profit 600.
  const entries: Array<[string, string, number, number]> = [
    ["led-src-rev", "6001", 0, 1000],
    ["led-src-exp", "6601", 400, 0]
  ];
  for (const [id, code, debit, credit] of entries) {
    await pool.query(
      `insert into ledger_entries
        (id, company_id, voucher_id, entry_date, summary, account_code, account_name, debit, credit, source, posted_at)
       values ($1, $2, 'vch-src-close', $3::date, '源分录', $4, $5, $6::numeric, $7::numeric, 'voucher_posting', $8::timestamptz)`,
      [id, COMPANY, AS_OF, code, code === "6001" ? "主营业务收入" : "管理费用", debit, credit, NOW]
    );
  }
}

async function cleanup() {
  await pool.query("delete from ledger_entries where company_id = $1", [COMPANY]);
  await pool.query("delete from period_closings where company_id = $1", [COMPANY]);
  await pool.query("delete from vouchers where company_id = $1", [COMPANY]);
  await pool.query("delete from companies where id = $1", [COMPANY]);
}

async function accountBalance(code: string): Promise<number> {
  const result = await pool.query<{ bal: string }>(
    "select coalesce(sum(debit - credit), 0) as bal from ledger_entries where company_id = $1 and account_code = $2",
    [COMPANY, code]
  );
  return Number(result.rows[0]?.bal ?? 0);
}

before(seed);
after(async () => {
  await cleanup();
  await pool.end();
});

test("closePeriod posts a balanced closing voucher and zeroes P&L accounts", async () => {
  const client = await pool.connect();
  let result;
  try {
    await client.query("BEGIN");
    result = await closePeriod(client, { companyId: COMPANY, periodLabel: PERIOD, asOfDate: AS_OF, now: NOW });
    await client.query("COMMIT");
  } finally {
    client.release();
  }

  assert.equal(result.alreadyClosed, false);
  assert.equal(result.netProfit, 600);
  assert.ok(result.voucherId);

  // After closing: revenue and expense accounts net to zero; 本年利润 carries the profit.
  assert.equal(await accountBalance("6001"), 0, "revenue must be closed to zero");
  assert.equal(await accountBalance("6601"), 0, "expense must be closed to zero");
  assert.equal(await accountBalance("3131"), -600, "本年利润 holds net credit of the profit");

  // The closing voucher itself must balance.
  const totals = await pool.query<{ d: string; c: string }>(
    "select coalesce(sum(debit),0) d, coalesce(sum(credit),0) c from ledger_entries where voucher_id = $1",
    [result.voucherId]
  );
  assert.equal(Number(totals.rows[0]!.d), Number(totals.rows[0]!.c), "closing voucher must balance");
});

test("closePeriod is idempotent per company and period", async () => {
  const client = await pool.connect();
  let second;
  try {
    await client.query("BEGIN");
    second = await closePeriod(client, { companyId: COMPANY, periodLabel: PERIOD, asOfDate: AS_OF, now: NOW });
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  assert.equal(second.alreadyClosed, true);
  assert.equal(second.voucherId, `vch-close-${COMPANY}-${PERIOD}`);

  // No duplicate closing entries were created.
  const count = await pool.query<{ n: string }>(
    "select count(*) n from ledger_entries where company_id = $1 and source = 'period_closing'",
    [COMPANY]
  );
  assert.equal(Number(count.rows[0]!.n), 3);
});
