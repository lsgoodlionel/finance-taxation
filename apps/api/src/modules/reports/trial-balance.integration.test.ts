/**
 * 试算平衡表的路径级测试（V12-B6 / 蓝图 F3）。
 *
 * 覆盖四件必须钉死的事：
 *   1. 六栏数字正确（期初 / 本期发生 / 期末，且期末 = 期初 + 本期）；
 *   2. 表尾借贷合计相等、差额为 0，且差额非零时显式标出；
 *   3. 本期毫无发生额的启用科目仍然出现在表上（表以科目表为骨架，不是以分录为骨架）；
 *   4. 结转损益分录**被包含在内**——账簿列示口径，见 ledger/closing-entries.ts。
 *      这一条用「结转后 6xxx 期末归零、本期发生额里看得见结转的那一笔」来验证，
 *      而不是只看合计，因为合计对「整批漏掉结转分录」并不敏感（结转本身也是平的）。
 *
 * 另外钉住 `listCompanyLedgerEntries` 加了 dateFrom/dateTo 之后**不传参行为不变**——
 * 它有 7 处调用方分布在凭证、税务、风险、驾驶舱，签名改动一旦改变默认行为，
 * 失真会是静默的。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";
import type { TrialBalanceReport, TrialBalanceRow } from "./trial-balance.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const BUSINESS_EVENT_ID = "PUR-STD-001";
const DRAFT_ID = "tb-fixture-draft";
const VOUCHER_ID = "tb-fixture-voucher";

const APRIL = "2026-04";
const APRIL_END = "2026-04-30";
const MAY = "2026-05";
const MAY_END = "2026-05-31";

function createAuthContext(): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-accountant"],
    token: "test-token"
  };
}

function createResponseCapture() {
  let statusCode = 200;
  let body = "";

  const response = {
    writeHead(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return response;
    },
    end(chunk?: string) {
      if (chunk) {
        body += chunk;
      }
      return response;
    }
  } as unknown as ServerResponse;

  return {
    response,
    readJson<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

async function prepareDatabase() {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

interface EntryFixture {
  id: string;
  entryDate: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

/**
 * 夹具刻意跨两个期间，因为「期初」这一栏只有在**本期之前另有分录**时才可能算错。
 *
 * 2026-04（本期之前）：
 *   1002 银行存款 1000 / 3001 实收资本 1000
 *   1002 银行存款  600 / 6001 主营业务收入 600
 *   6201 销售费用  100 / 1002 银行存款  100
 *   → 期初：1002 借 1500、3001 贷 1000、6001 贷 600、6201 借 100（借贷各 1600）
 *
 * 2026-05（本期）：
 *   1002 银行存款  300 / 6001 主营业务收入 300
 *   6201 销售费用   50 / 1002 银行存款   50
 *   1405 库存商品  200 / 2202 应付账款  200
 *   → 本期发生：借 550 / 贷 550
 *   → 期末：1002 借 1750、3001 贷 1000、6001 贷 900、6201 借 150、
 *          1405 借 200、2202 贷 200（借贷各 2100）
 *
 * 1405「库存商品」是**故意**选的：科目模板里登记的是 1403，1405 未登记。
 * 用它来验证「账上有余额、科目表没登记」的编码不会被静默丢弃。
 */
const APRIL_ENTRIES: EntryFixture[] = [
  { id: "tb-le-1", entryDate: "2026-04-05", accountCode: "1002", accountName: "银行存款", debit: "1000.00", credit: "0.00" },
  { id: "tb-le-2", entryDate: "2026-04-05", accountCode: "3001", accountName: "实收资本", debit: "0.00", credit: "1000.00" },
  { id: "tb-le-3", entryDate: "2026-04-18", accountCode: "1002", accountName: "银行存款", debit: "600.00", credit: "0.00" },
  { id: "tb-le-4", entryDate: "2026-04-18", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "600.00" },
  { id: "tb-le-5", entryDate: "2026-04-22", accountCode: "6601", accountName: "销售费用", debit: "100.00", credit: "0.00" },
  { id: "tb-le-6", entryDate: "2026-04-22", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "100.00" }
];

const MAY_ENTRIES: EntryFixture[] = [
  { id: "tb-le-7", entryDate: "2026-05-09", accountCode: "1002", accountName: "银行存款", debit: "300.00", credit: "0.00" },
  { id: "tb-le-8", entryDate: "2026-05-09", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "300.00" },
  { id: "tb-le-9", entryDate: "2026-05-15", accountCode: "6601", accountName: "销售费用", debit: "50.00", credit: "0.00" },
  { id: "tb-le-10", entryDate: "2026-05-15", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "50.00" },
  { id: "tb-le-11", entryDate: "2026-05-20", accountCode: "1405", accountName: "库存商品", debit: "200.00", credit: "0.00" },
  { id: "tb-le-12", entryDate: "2026-05-20", accountCode: "2202", accountName: "应付账款", debit: "0.00", credit: "200.00" }
];

/** 落在本期之后的分录：绝不能出现在 2026-05 的任何一栏里。 */
const JUNE_ENTRIES: EntryFixture[] = [
  { id: "tb-le-13", entryDate: "2026-06-03", accountCode: "1002", accountName: "银行存款", debit: "9999.00", credit: "0.00" },
  { id: "tb-le-14", entryDate: "2026-06-03", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "9999.00" }
];

async function seedLedgerFixtures(pool: pg.Pool, entries: EntryFixture[]): Promise<void> {
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1, $2, $3, 'accrual', 'approved', '试算平衡夹具草稿')
     on conflict (id) do nothing`,
    [DRAFT_ID, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, posted_at)
     values ($1, $2, $3, $4, 'accrual', '试算平衡夹具凭证', 'posted', now())
     on conflict (id) do nothing`,
    [VOUCHER_ID, COMPANY_ID, BUSINESS_EVENT_ID, DRAFT_ID]
  );
  for (const entry of entries) {
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, business_event_id, entry_date, summary,
         account_code, account_name, debit, credit
       ) values ($1, $2, $3, $4, $5::date, '试算平衡夹具', $6, $7, $8::numeric, $9::numeric)`,
      [
        entry.id,
        COMPANY_ID,
        VOUCHER_ID,
        BUSINESS_EVENT_ID,
        entry.entryDate,
        entry.accountCode,
        entry.accountName,
        entry.debit,
        entry.credit
      ]
    );
  }
}

async function fetchTrialBalance(period: string) {
  const { getTrialBalance } = await import("./trial-balance.routes.js");
  const capture = createResponseCapture();
  await getTrialBalance(
    {
      method: "GET",
      url: `/api/reports/trial-balance?period=${period}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson<TrialBalanceReport>();
}

function rowOf(report: TrialBalanceReport, code: string): TrialBalanceRow {
  const row = report.rows.find((item) => item.accountCode === code);
  assert.ok(row, `科目 ${code} 必须出现在试算平衡表上`);
  return row!;
}

async function runClosePeriod(periodLabel: string, asOfDate: string) {
  const { withTransaction } = await import("../../db/client.js");
  const { closePeriod } = await import("../ledger/close-period.js");
  return withTransaction((client) =>
    closePeriod(client, {
      companyId: COMPANY_ID,
      periodLabel,
      asOfDate,
      now: `${asOfDate}T23:59:59.000Z`
    })
  );
}

// ─── 1 + 2 + 3：六栏数字、借贷合计、无发生额科目 ─────────────────────────────

test("trial balance reports six columns, balanced totals, and idle accounts", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    await seedLedgerFixtures(pool, [...APRIL_ENTRIES, ...MAY_ENTRIES, ...JUNE_ENTRIES]);

    const result = await fetchTrialBalance(MAY);
    assert.equal(result.statusCode, 200);
    const report = result.body!;

    assert.equal(report.period, MAY);
    assert.equal(report.startDate, "2026-05-01");
    assert.equal(report.endDate, MAY_END);
    assert.equal(report.fiscalYearStart, "2026-01-01");

    // ── 六栏数字 ────────────────────────────────────────────────────────────
    const bank = rowOf(report, "1002");
    assert.equal(bank.openingDebit, "1500.00");
    assert.equal(bank.openingCredit, "0.00");
    assert.equal(bank.periodDebit, "300.00");
    assert.equal(bank.periodCredit, "50.00");
    assert.equal(bank.closingDebit, "1750.00");
    assert.equal(bank.closingCredit, "0.00");

    const revenue = rowOf(report, "6001");
    assert.equal(revenue.openingCredit, "600.00", "4 月收入构成 5 月的期初");
    assert.equal(revenue.periodCredit, "300.00");
    assert.equal(revenue.closingCredit, "900.00");
    assert.equal(revenue.openingBasis, "fiscal_year", "损益类期初按财年起算");

    const capital = rowOf(report, "3001");
    assert.equal(capital.openingCredit, "1000.00");
    assert.equal(capital.periodDebit, "0.00");
    assert.equal(capital.periodCredit, "0.00");
    assert.equal(capital.closingCredit, "1000.00");
    assert.equal(capital.openingBasis, "inception", "权益类期初按建库至今");

    const payable = rowOf(report, "2202");
    assert.equal(payable.openingCredit, "0.00", "本期才发生，期初必须为 0");
    assert.equal(payable.periodCredit, "200.00");
    assert.equal(payable.closingCredit, "200.00");

    // 期末之后的分录不得渗进任何一栏（下推的日期上界必须真的生效）
    assert.equal(bank.closingDebit, "1750.00", "6 月的 9999 不得进入 5 月的期末");
    assert.equal(revenue.periodCredit, "300.00", "6 月的 9999 不得进入 5 月的本期发生");

    // ── 表尾合计与差额 ──────────────────────────────────────────────────────
    assert.equal(report.totals.opening.debit, "1600.00");
    assert.equal(report.totals.opening.credit, "1600.00");
    assert.equal(report.totals.period.debit, "550.00");
    assert.equal(report.totals.period.credit, "550.00");
    assert.equal(report.totals.closing.debit, "2100.00");
    assert.equal(report.totals.closing.credit, "2100.00");
    for (const [name, group] of Object.entries(report.totals)) {
      assert.equal(group.difference, "0.00", `${name} 差额必须为 0`);
      assert.equal(group.isBalanced, true, `${name} 必须借贷相等`);
    }
    assert.equal(report.isBalanced, true);

    // 逐行自洽：期末 = 期初 + 本期（按净额）
    for (const row of report.rows) {
      const net = (debit: string, credit: string) => Number(debit) - Number(credit);
      assert.equal(
        net(row.closingDebit, row.closingCredit),
        net(row.openingDebit, row.openingCredit) + net(row.periodDebit, row.periodCredit),
        `科目 ${row.accountCode} 的期末必须等于期初加本期发生`
      );
    }

    // ── 无发生额的启用科目也在表上 ──────────────────────────────────────────
    const idle = rowOf(report, "1121"); // 应收票据：科目表里有，账上从未用过
    assert.equal(idle.isEmpty, true);
    assert.equal(idle.accountName, "应收票据", "空行也要带科目表里的名称");
    assert.deepEqual(
      [idle.openingDebit, idle.openingCredit, idle.periodDebit, idle.periodCredit, idle.closingDebit, idle.closingCredit],
      ["0.00", "0.00", "0.00", "0.00", "0.00", "0.00"]
    );
    assert.ok(
      report.rows.filter((row) => row.isEmpty).length > 10,
      "科目表里绝大多数科目本期无发生额，它们都应当在表上"
    );

    // ── 账上有余额、科目表没登记的编码不得消失 ──────────────────────────────
    const unregistered = rowOf(report, "1405");
    assert.equal(unregistered.isRegistered, false);
    assert.equal(unregistered.closingDebit, "200.00");
    assert.ok(
      report.warnings.some((warning) => warning.includes("1405")),
      `未登记科目必须点名告警，实际：${JSON.stringify(report.warnings)}`
    );

    // 科目编码升序，且一个编码只出现一行
    const codes = report.rows.map((row) => row.accountCode);
    assert.deepEqual(codes, [...codes].sort(), "行必须按科目编码升序");
    assert.equal(new Set(codes).size, codes.length, "同一科目不得出现两行");
  } finally {
    await closePool();
    await pool.end();
  }
});

// ─── 4：结转分录必须被包含 ───────────────────────────────────────────────────

test("period closing entries are included, zeroing P&L and moving profit into 3131", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    await seedLedgerFixtures(pool, [...APRIL_ENTRIES, ...MAY_ENTRIES]);

    // 4 月结转：收入 600 − 费用 100 = 500 转入 3131
    const april = await runClosePeriod(APRIL, APRIL_END);
    assert.equal(april.netProfit, 500);
    // 5 月结转：收入 300 − 费用 50 = 250 转入 3131
    const may = await runClosePeriod(MAY, MAY_END);
    assert.equal(may.netProfit, 250);

    const result = await fetchTrialBalance(MAY);
    assert.equal(result.statusCode, 200);
    const report = result.body!;

    // 结转分录被计入「本期发生额」——这是它们确实没被过滤掉的直接证据。
    // 6001 本期贷方 300 来自业务分录，本期借方 300 只可能来自结转分录。
    const revenue = rowOf(report, "6001");
    assert.equal(revenue.periodCredit, "300.00");
    assert.equal(revenue.periodDebit, "300.00", "本期借方 300 只可能来自结转分录");
    assert.equal(revenue.closingDebit, "0.00");
    assert.equal(revenue.closingCredit, "0.00", "结转后收入类期末必须归零");
    assert.equal(revenue.openingCredit, "0.00", "4 月已结转，5 月期初为 0");

    const expense = rowOf(report, "6601");
    assert.equal(expense.periodDebit, "50.00");
    assert.equal(expense.periodCredit, "50.00", "本期贷方 50 只可能来自结转分录");
    assert.equal(expense.closingDebit, "0.00");
    assert.equal(expense.closingCredit, "0.00", "结转后费用类期末必须归零");

    // 3131 本年利润承载两次结转：期初 500（4 月）、本期 250（5 月）、期末 750
    const profit = rowOf(report, "4103");
    assert.equal(profit.openingCredit, "500.00");
    assert.equal(profit.periodCredit, "250.00");
    assert.equal(profit.closingCredit, "750.00");

    // 含结转分录之后，三组合计仍必须借贷相等
    assert.equal(report.totals.opening.debit, report.totals.opening.credit);
    assert.equal(report.totals.period.debit, report.totals.period.credit);
    assert.equal(report.totals.closing.debit, report.totals.closing.credit);
    assert.equal(report.totals.closing.debit, "1950.00");
    assert.equal(report.isBalanced, true);
    assert.equal(
      report.warnings.filter((warning) => warning.includes("借贷不平")).length,
      0,
      `完整且平衡的账簿不应产生不平告警，实际：${JSON.stringify(report.warnings)}`
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

// ─── 差额非零：这张表是探针，必须报出来 ──────────────────────────────────────

test("an out-of-balance ledger surfaces a non-zero difference instead of a clean-looking table", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    await seedLedgerFixtures(pool, MAY_ENTRIES);

    // 迁移 047 的 CHECK 只约束单行形状（非负、单侧非零），拦不住「只写一条腿」。
    // 这正是试算平衡表要发现的那类问题。
    await seedLedgerFixtures(pool, [
      { id: "tb-le-orphan", entryDate: "2026-05-28", accountCode: "1002", accountName: "银行存款", debit: "12.34", credit: "0.00" }
    ]);

    const report = (await fetchTrialBalance(MAY)).body!;
    assert.equal(report.totals.period.difference, "12.34");
    assert.equal(report.totals.period.isBalanced, false);
    assert.equal(report.totals.closing.difference, "12.34");
    assert.equal(report.isBalanced, false);
    assert.ok(
      report.warnings.some((warning) => warning.includes("本期发生额借贷不平") && warning.includes("12.34")),
      `差额非零必须显式告警并给出数字，实际：${JSON.stringify(report.warnings)}`
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

// ─── 边界与租户隔离 ──────────────────────────────────────────────────────────

test("period parameter is validated and other companies' ledgers never leak in", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    await seedLedgerFixtures(pool, MAY_ENTRIES);

    for (const bad of ["", "2026", "2026-13", "2026-00", "2026-5", "not-a-period"]) {
      const result = await fetchTrialBalance(bad);
      assert.equal(result.statusCode, 400, `period=${bad} 必须被拒绝`);
    }

    // cmp-tech-001（迁移 015 的一年期模拟数据）有大量 2026 年分录，
    // 它们一条都不能出现在 cmp-v4-tech 的表上。
    const report = (await fetchTrialBalance(MAY)).body!;
    assert.equal(report.totals.period.debit, "550.00", "别家公司的分录不得渗入");
    assert.equal(rowOf(report, "1002").closingDebit, "250.00");
  } finally {
    await closePool();
    await pool.end();
  }
});

// ─── 取数层：加了 dateFrom/dateTo 之后不传参必须行为不变 ──────────────────────

test("listCompanyLedgerEntries keeps its exact previous behaviour when no date range is passed", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    await seedLedgerFixtures(pool, [...APRIL_ENTRIES, ...MAY_ENTRIES, ...JUNE_ENTRIES]);
    const { listCompanyLedgerEntries } = await import("../vouchers/routes.js");

    // 不传参：全部分录，一条不少
    const all = await listCompanyLedgerEntries(COMPANY_ID);
    assert.equal(all.length, APRIL_ENTRIES.length + MAY_ENTRIES.length + JUNE_ENTRIES.length);

    // 显式传 undefined 与完全不传等价（可选参数不得因 falsy 判断而改变语义）
    const withUndefined = await listCompanyLedgerEntries(COMPANY_ID, {
      dateFrom: undefined,
      dateTo: undefined
    });
    assert.deepEqual(withUndefined, all, "传 undefined 必须与不传完全一致");

    // 下推的区间过滤与在内存里 filter 的结果必须逐条一致
    const pushedDown = await listCompanyLedgerEntries(COMPANY_ID, {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31"
    });
    const filteredInMemory = all.filter(
      (entry) => entry.entryDate >= "2026-05-01" && entry.entryDate <= "2026-05-31"
    );
    assert.deepEqual(pushedDown, filteredInMemory, "SQL 下推的结果必须与内存过滤逐条一致");
    assert.equal(pushedDown.length, MAY_ENTRIES.length);

    // 边界是闭区间：期初日与期末日当天的分录都要在内
    const singleDay = await listCompanyLedgerEntries(COMPANY_ID, {
      dateFrom: "2026-05-09",
      dateTo: "2026-05-09"
    });
    assert.equal(singleDay.length, 2, "区间两端均为闭区间");

    // 与既有筛选条件叠加时互不干扰
    const combined = await listCompanyLedgerEntries(COMPANY_ID, {
      voucherId: VOUCHER_ID,
      dateFrom: "2026-06-01"
    });
    assert.equal(combined.length, JUNE_ENTRIES.length);
  } finally {
    await closePool();
    await pool.end();
  }
});
