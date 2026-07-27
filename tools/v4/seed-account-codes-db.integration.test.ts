import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resetTestDatabase } from "./reset-test-db.js";
import { CHART_OF_ACCOUNTS } from "../../apps/api/src/modules/accounts/chart-of-accounts.js";
import {
  buildBalanceSheetReport,
  buildProfitStatementReport
} from "../../apps/api/src/modules/reports/summary.js";
import type { LedgerEntry } from "@finance-taxation/domain-model";

/**
 * 种子数据科目编码的守门测试（migration 041 的回归锁）。
 *
 * 015_startup_year1_simulation 原本整份按国标 2006 编号书写（收入 5xxx、权益
 * 4xxx、管理费用 6602 …），与本系统 chart-of-accounts.ts 的自定义编码不是一套：
 * 报表按科目码取数，表外的码被静默归为 other，288,679 收入在利润表上恒为 0、
 * 500,000 实收资本（4001 在本系统实为「生产成本」）直接从权益消失，资产负债表
 * 差 788,679 不配平。041 已把三张表的 account_code 改到位。
 *
 * 本测试把「种子数据不得出现科目表之外的科目码」固化成断言，将来谁再按国标写
 * 一笔分录都会在这里被拦下，而不是等报表金额悄悄变 0 才被发现。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX_MIGRATION = resolve(repoRoot, "migrations/041_fix_seed_account_codes.sql");

/** 015 模拟数据所属公司；断言只针对这份种子，不波及其他测试写入的数据。 */
const SEED_COMPANY = "cmp-tech-001";

/** 承载 account_code 的三张表 —— 任一张漏改都会让凭证与总账对不上。 */
const ACCOUNT_CODE_TABLES = ["ledger_entries", "voucher_lines", "voucher_draft_lines"] as const;

const KNOWN_ACCOUNT_CODES = new Set(CHART_OF_ACCOUNTS.map((account) => account.code));

/**
 * 可记账的叶子科目。父级科目（isLeaf=false）不可入账：按前缀汇总时会与子科目
 * 重复计量，且科目选择器只列叶子（accounts/routes.ts），父级在 UI 上根本选不到。
 */
const LEAF_ACCOUNT_CODES = new Set(
  CHART_OF_ACCOUNTS.filter((account) => account.isLeaf).map((account) => account.code)
);

const admin = new pg.Pool({ connectionString: databaseUrl });
let reachable = false;

interface CodeRow {
  account_code: string;
  account_name: string;
}

async function canConnect(): Promise<boolean> {
  try {
    await admin.query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function readCodes(table: string): Promise<CodeRow[]> {
  const { rows } = await admin.query<CodeRow>(
    `select distinct account_code, account_name from ${table} order by account_code, account_name`
  );
  return rows;
}

async function readSeedLedger(): Promise<LedgerEntry[]> {
  const { rows } = await admin.query<{
    id: string;
    company_id: string;
    voucher_id: string;
    business_event_id: string;
    entry_date: string;
    summary: string;
    account_code: string;
    account_name: string;
    debit: string;
    credit: string;
    posted_at: Date;
  }>(
    `select id, company_id, voucher_id, business_event_id,
            to_char(entry_date, 'YYYY-MM-DD') as entry_date,
            summary, account_code, account_name, debit, credit, posted_at
       from ledger_entries
      where company_id = $1
      order by entry_date, id`,
    [SEED_COMPANY]
  );

  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    entryDate: row.entry_date,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: row.debit,
    credit: row.credit,
    source: "voucher_posting",
    postedAt: row.posted_at.toISOString()
  }));
}

before(async () => {
  reachable = await canConnect();
  if (!reachable) return;
  // 全量重跑 migration，包含 015（种子）与 041（编码修正）
  await resetTestDatabase(databaseUrl);
});

after(async () => {
  await admin.end();
});

for (const table of ACCOUNT_CODE_TABLES) {
  test(`${table} 中不存在科目表之外的科目码`, async (t) => {
    if (!reachable) {
      t.skip(`skipped: cannot reach ${databaseUrl}`);
      return;
    }

    const unknown = (await readCodes(table)).filter(
      (row) => !KNOWN_ACCOUNT_CODES.has(row.account_code)
    );

    assert.deepEqual(
      unknown,
      [],
      `${table} 出现未在 CHART_OF_ACCOUNTS 登记的科目码；` +
        "报表按科目码取数，未登记的码会被静默丢弃（金额恒为 0）。" +
        `请改用 chart-of-accounts.ts 的编码，勿沿用国标 2006 编号：${JSON.stringify(unknown)}`
    );
  });
}

for (const table of ACCOUNT_CODE_TABLES) {
  test(`${table} 中不存在记账到非叶子科目的分录`, async (t) => {
    if (!reachable) {
      t.skip(`skipped: cannot reach ${databaseUrl}`);
      return;
    }

    // 只看已登记的码：未登记的码由上一组测试负责，这里不重复报同一个问题。
    const nonLeaf = (await readCodes(table)).filter(
      (row) => KNOWN_ACCOUNT_CODES.has(row.account_code) && !LEAF_ACCOUNT_CODES.has(row.account_code)
    );

    assert.deepEqual(
      nonLeaf,
      [],
      `${table} 出现记账到父级科目的分录；父级与子科目会重复计量，` +
        "且科目选择器只列叶子科目（用户在 UI 上选不到父级）。" +
        `请改记到具体的叶子科目：${JSON.stringify(nonLeaf)}`
    );
  });
}

test("凭证行与总账分录的科目码逐笔一致", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }

  const { rows } = await admin.query<{
    voucher_id: string;
    account_name: string;
    ledger_code: string;
    voucher_code: string;
  }>(
    `select l.voucher_id, l.account_name,
            l.account_code as ledger_code, v.account_code as voucher_code
       from ledger_entries l
       join voucher_lines v
         on v.voucher_id = l.voucher_id
        and v.account_name = l.account_name
        and v.debit = l.debit
        and v.credit = l.credit
      where l.company_id = $1
        and l.account_code <> v.account_code`,
    [SEED_COMPANY]
  );

  assert.deepEqual(rows, [], "同一张凭证的 voucher_lines 与 ledger_entries 科目码必须相同");
});

test("种子期间的收入与实收资本进入报表，且资产负债表配平", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }

  const entries = await readSeedLedger();
  assert.ok(entries.length > 0, "015 种子分录必须存在");

  const profit = buildProfitStatementReport({ periodLabel: "2026", entries });
  // 主营业务收入 188,679 + 其他业务收入 100,000；修正前这两笔的科目码（5001/5051）
  // 不在科目表内，revenue 恒为 0。金额按数值比对，不锁定报表的字符串格式。
  assert.equal(Number(profit.totals.revenue), 288679);

  const balance = buildBalanceSheetReport({
    periodLabel: "2026",
    entries,
    asOfDate: "2026-12-31"
  });

  // 实收资本 500,000：修正前挂在 4001（本系统的「生产成本」），既不进权益也不进损益。
  const paidInCapital = balance.equity.find((line) => line.code === "3001");
  assert.equal(Number(paidInCapital?.amount), 500000, "实收资本必须出现在所有者权益中");

  assert.equal(
    Number(balance.totals.assets),
    Number(balance.totals.liabilitiesAndEquity),
    "资产必须等于负债 + 所有者权益"
  );
});

test("041 编码修正迁移可重复执行且不再变更任何行（幂等）", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }

  const before = await Promise.all(ACCOUNT_CODE_TABLES.map((table) => readCodes(table)));
  await admin.query(await readFile(FIX_MIGRATION, "utf8"));
  const after = await Promise.all(ACCOUNT_CODE_TABLES.map((table) => readCodes(table)));

  assert.deepEqual(after, before, "重复执行 041 不得再改动任何科目码");
});
