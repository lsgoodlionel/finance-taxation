/**
 * 会计年度 + 年末结转的**路径级**断言（V12-B5 / 蓝图 E6）。
 *
 * ## 被钉住的缺陷
 *
 * `generateClosingEntries` 每次月结都往 3131 本年利润记贷方且从不清零，全仓没有
 * 任何代码把 3131 结转到 3141 利润分配。6xxx 因为结转分录会自我冲平所以自洽，
 * 3131 不会 —— 系统跑满一个自然年就会出错，资产负债表的「本年利润」行会显示历年
 * 累计数。影响在 2027 年 1 月显现。
 *
 * 核心断言形态：**造两个自然年的利润 → 逐年结账 → 断言第二年的年结金额只等于
 * 第二年的利润，不含第一年**。这是这个缺陷唯一可靠的回归方式。
 *
 * 同时钉住两条路线并存：
 * - 传统路线：账上有一张真实的年结凭证（借 3131 / 贷 3141），审计要看到它；
 * - Odoo 路线：报表按财年区间取数，**即使忘了做年结，每年的净利润也算得对**。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

/** 2026 年：收入 1000、销售费用 400 → 净利润 600。 */
const YEAR_2026 = [
  { code: "1002", name: "银行存款", debit: "1000.00", credit: "0.00", date: "2026-03-15" },
  { code: "6001", name: "主营业务收入", debit: "0.00", credit: "1000.00", date: "2026-03-15" },
  { code: "6201", name: "销售费用", debit: "400.00", credit: "0.00", date: "2026-04-20" },
  { code: "1002", name: "银行存款", debit: "0.00", credit: "400.00", date: "2026-04-20" }
];

/** 2027 年：收入 900 → 净利润 900。 */
const YEAR_2027 = [
  { code: "1002", name: "银行存款", debit: "900.00", credit: "0.00", date: "2027-05-10" },
  { code: "6001", name: "主营业务收入", debit: "0.00", credit: "900.00", date: "2027-05-10" }
];

/** 2026 年亏损版：费用 500、无收入 → 净利润 −500。 */
const YEAR_2026_LOSS = [
  { code: "6201", name: "销售费用", debit: "500.00", credit: "0.00", date: "2026-06-01" },
  { code: "1002", name: "银行存款", debit: "0.00", credit: "500.00", date: "2026-06-01" }
];

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
    writeHead(next: number) {
      statusCode = next;
      return response;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
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

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

interface EntryFixture {
  code: string;
  name: string;
  debit: string;
  credit: string;
  date: string;
}

/** 业务分录夹具。每笔自身借贷平衡，资产负债表恒平的断言依赖这一点。 */
async function seedEntries(pool: pg.Pool, key: string, entries: EntryFixture[]): Promise<void> {
  const voucherId = `vch-fy-${key}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', $3, 'posted', 'analysis', $4::date, $5, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, `年结回归夹具 ${key}`, entries[0]!.date, entries[0]!.date.slice(0, 7)]
  );
  let index = 0;
  for (const entry of entries) {
    index += 1;
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, entry_date, summary,
         account_code, account_name, debit, credit, source
       ) values ($1, $2, $3, $4::date, '年结回归夹具', $5, $6, $7::numeric, $8::numeric, 'voucher_posting')`,
      [
        `led-fy-${key}-${index}`,
        COMPANY_ID,
        voucherId,
        entry.date,
        entry.code,
        entry.name,
        entry.debit,
        entry.credit
      ]
    );
  }
}

async function runClosePeriod(periodLabel: string, asOfDate: string) {
  const { withTransaction } = await import("../../db/client.js");
  const { closePeriod } = await import("./close-period.js");
  return withTransaction((client) =>
    closePeriod(client, {
      companyId: COMPANY_ID,
      periodLabel,
      asOfDate,
      now: `${asOfDate}T23:59:59.000Z`
    })
  );
}

interface CloseYearResponse {
  alreadyClosed: boolean;
  year: number;
  netProfit: number;
  voucherId: string | null;
  fiscalYear: { status: string; netProfit: string | null; closingVoucherId: string | null };
}

/** 走 HTTP handler，而不是直接调模块函数 —— 路径级断言是 V12 的硬要求。 */
async function closeYearViaRoute(year: number) {
  const { closeFiscalYearRoute } = await import("./fiscal-year.routes.js");
  const capture = createResponseCapture();
  await closeFiscalYearRoute(
    {
      method: "POST",
      url: `/api/ledger/fiscal-years/${year}/close`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response,
    String(year)
  );
  return capture.readJson<CloseYearResponse & { code?: string; error?: string; pendingYears?: number[]; offendingCodes?: string[] }>();
}

async function accountBalance(pool: pg.Pool, code: string, asOf: string): Promise<number> {
  const result = await pool.query<{ balance: string }>(
    `select coalesce(sum(credit - debit), 0)::text as balance from ledger_entries
     where company_id = $1 and account_code = $2 and entry_date <= $3::date`,
    [COMPANY_ID, code, asOf]
  );
  return Number(result.rows[0]!.balance);
}

test("跨两个自然年：第二年的年结金额只等于第二年的利润，不含第一年", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "2026", YEAR_2026);
    await runClosePeriod("2026-12", "2026-12-31");

    // 月结之后 3131 承载 2026 全年利润，3141 还是空的 —— 这就是缺陷的起点。
    assert.equal(await accountBalance(pool, "4103", "2026-12-31"), 600);
    assert.equal(await accountBalance(pool, "4104", "2026-12-31"), 0);

    const closed2026 = await closeYearViaRoute(2026);
    assert.equal(closed2026.statusCode, 201, JSON.stringify(closed2026.body));
    assert.equal(closed2026.body!.netProfit, 600);
    // 年结之后 3131 归零，利润落到 3141 —— 这正是原来缺失的那一步。
    assert.equal(await accountBalance(pool, "4103", "2026-12-31"), 0);
    assert.equal(await accountBalance(pool, "4104", "2026-12-31"), 600);

    await seedEntries(pool, "2027", YEAR_2027);
    await runClosePeriod("2027-12", "2027-12-31");
    // 2027 月结后 3131 只承载 2027 的利润（2026 的已被年结冲平）
    assert.equal(await accountBalance(pool, "4103", "2027-12-31"), 900);

    const closed2027 = await closeYearViaRoute(2027);
    assert.equal(closed2027.statusCode, 201, JSON.stringify(closed2027.body));
    // ★ 核心回归：若年结取数排除了历史年结分录，这里会变成 1500（2026 被重复结转一遍）
    assert.equal(closed2027.body!.netProfit, 900, "第二年的年结金额不得包含第一年的利润");
    assert.equal(await accountBalance(pool, "4103", "2027-12-31"), 0);
    assert.equal(await accountBalance(pool, "4104", "2027-12-31"), 1500);
  } finally {
    await closePool();
    await pool.end();
  }
});

test("年结凭证是账上真实存在的一张凭证，有会计日期、期间与字号", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "2026", YEAR_2026);
    await runClosePeriod("2026-12", "2026-12-31");
    const closed = await closeYearViaRoute(2026);
    assert.equal(closed.statusCode, 201);

    const voucher = await pool.query<{
      accounting_date: string;
      period: string;
      voucher_word: string;
      voucher_seq: number;
      source: string;
      status: string;
    }>(
      `select accounting_date, period, voucher_word, voucher_seq, source, status
       from vouchers where id = $1`,
      [closed.body!.voucherId]
    );
    const row = voucher.rows[0]!;
    // 审计要在账上看到这张凭证 —— 只做 Odoo 取数路线是不够的。
    assert.equal(row.accounting_date, "2026-12-31");
    assert.equal(row.period, "2026-12");
    assert.equal(row.source, "annual_closing");
    assert.equal(row.status, "posted");
    assert.ok(row.voucher_seq >= 1, "年结凭证必须有连续编号");

    const entries = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit, credit from ledger_entries
       where voucher_id = $1 order by account_code`,
      [closed.body!.voucherId]
    );
    assert.deepEqual(
      entries.rows.map((e) => [e.account_code, Number(e.debit), Number(e.credit)]),
      [
        ["4103", 600, 0],
        ["4104", 0, 600]
      ],
      "盈利年度：借 3131 / 贷 3141"
    );

    // fiscal_years 记录了这一年结了多少、凭证是哪张
    const fy = await pool.query<{ status: string; net_profit: string; closing_voucher_id: string }>(
      `select status, net_profit, closing_voucher_id from fiscal_years
       where company_id = $1 and year = 2026`,
      [COMPANY_ID]
    );
    assert.equal(fy.rows[0]!.status, "closed");
    assert.equal(Number(fy.rows[0]!.net_profit), 600);
    assert.equal(fy.rows[0]!.closing_voucher_id, closed.body!.voucherId);

    // 幂等：重复调用不再生成第二张凭证
    const again = await closeYearViaRoute(2026);
    assert.equal(again.statusCode, 200);
    assert.equal(again.body!.alreadyClosed, true);
    const count = await pool.query<{ n: string }>(
      `select count(*)::text n from vouchers where company_id = $1 and source = 'annual_closing'`,
      [COMPANY_ID]
    );
    assert.equal(count.rows[0]!.n, "1");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("亏损年度的分录反向：贷 3131 / 借 3141", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "loss", YEAR_2026_LOSS);
    await runClosePeriod("2026-12", "2026-12-31");
    const closed = await closeYearViaRoute(2026);
    assert.equal(closed.statusCode, 201, JSON.stringify(closed.body));
    assert.equal(closed.body!.netProfit, -500);

    const entries = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit, credit from ledger_entries
       where voucher_id = $1 order by account_code`,
      [closed.body!.voucherId]
    );
    assert.deepEqual(
      entries.rows.map((e) => [e.account_code, Number(e.debit), Number(e.credit)]),
      [
        ["4103", 0, 500],
        ["4104", 500, 0]
      ]
    );
    // 未分配利润为负（累计亏损）
    assert.equal(await accountBalance(pool, "4104", "2026-12-31"), -500);
    assert.equal(await accountBalance(pool, "4103", "2026-12-31"), 0);
  } finally {
    await closePool();
    await pool.end();
  }
});

test("损益未结转时拒绝年结；上年未结账时拒绝结本年", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "2026", YEAR_2026);

    // 还没做月结，6xxx 挂着余额 → 3131 承载的不是全年利润，此时结账会结出错数。
    const notClosed = await closeYearViaRoute(2026);
    assert.equal(notClosed.statusCode, 400);
    assert.equal(notClosed.body!.code, "PROFIT_AND_LOSS_NOT_CLOSED");
    assert.deepEqual(notClosed.body!.offendingCodes, ["6001", "6201"]);

    await runClosePeriod("2026-12", "2026-12-31");
    await seedEntries(pool, "2027", YEAR_2027);
    await runClosePeriod("2027-12", "2027-12-31");

    // 跳过 2026 直接结 2027：两年的利润会在 3141 上混成一笔，再也分不开，
    // 而「哪一年赚了多少」是分红、弥补亏损、所得税汇算的基础数据。
    const skipped = await closeYearViaRoute(2027);
    assert.equal(skipped.statusCode, 400);
    assert.equal(skipped.body!.code, "PRIOR_FISCAL_YEAR_OPEN");
    assert.deepEqual(skipped.body!.pendingYears, [2026]);

    const noVoucher = await pool.query<{ n: string }>(
      `select count(*)::text n from vouchers where company_id = $1 and source = 'annual_closing'`,
      [COMPANY_ID]
    );
    assert.equal(noVoucher.rows[0]!.n, "0", "被拒绝时不得留下年结凭证");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("资产负债表自检：差额被显式列出，且能区分「未结转」与「真不平」", async () => {
  await prepareDatabase();
  const { closePool, withTransaction } = await import("../../db/client.js");
  const { checkBalanceSheet } = await import("./balance-check.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "2026", YEAR_2026);
    await seedEntries(pool, "2027", YEAR_2027);

    // 完全没做过任何结转：资产 − 负债 − 权益 = 尚未结转的两年损益合计 1500。
    // ERPNext 的做法是把这个差额显式列成一行，而不是让它变成静默错数。
    const raw = await withTransaction((client) =>
      checkBalanceSheet(client, COMPANY_ID, "2027-12-31")
    );
    assert.equal(raw.difference, 1500);
    assert.equal(raw.unclosedProfitLoss, 1500);
    assert.equal(raw.residual, 0, "差额可被未结转损益完全解释 → 不是真错账");
    assert.ok(raw.notice && raw.notice.includes("尚未结转"), raw.notice ?? "应给出提示");

    // ★ Odoo 路线：即使一次年结都没做，每个财年的净利润也必须算得对。
    assert.deepEqual(
      raw.openFiscalYears.map((item) => [item.year, item.netProfit]),
      [
        [2026, 600],
        [2027, 900]
      ],
      "忘了做年结时，按财年区间取数仍要给出正确的分年净利润"
    );

    // 逐年结完之后差额归零，openFiscalYears 也清空
    await runClosePeriod("2026-12", "2026-12-31");
    await runClosePeriod("2027-12", "2027-12-31");
    assert.equal((await closeYearViaRoute(2026)).statusCode, 201);
    assert.equal((await closeYearViaRoute(2027)).statusCode, 201);

    const settled = await withTransaction((client) =>
      checkBalanceSheet(client, COMPANY_ID, "2027-12-31")
    );
    assert.equal(settled.difference, 0);
    assert.equal(settled.unclosedProfitLoss, 0);
    assert.deepEqual(settled.openFiscalYears, []);
    assert.equal(settled.notice, null);
    assert.equal(settled.equity, 1500, "利润全部沉淀到权益（3141 利润分配）");

    // 真的不平（单边分录）要能与「未结转」区分开 —— 前者需要人工介入，后者是常态。
    // 直接绕过 CHECK 是做不到的，这里用一张只有借方的凭证模拟脏数据。
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
       values ('vch-fy-broken', $1, 'general', '单边脏数据', 'posted', 'analysis', '2027-11-01'::date, '2027-11', now())`,
      [COMPANY_ID]
    );
    await pool.query(
      `insert into ledger_entries (id, company_id, voucher_id, entry_date, summary, account_code, account_name, debit, credit)
       values ('led-fy-broken', $1, 'vch-fy-broken', '2027-11-01'::date, '单边脏数据', '1002', '银行存款', 77, 0)`,
      [COMPANY_ID]
    );
    const broken = await withTransaction((client) =>
      checkBalanceSheet(client, COMPANY_ID, "2027-12-31")
    );
    assert.equal(broken.residual, 77, "总账借贷不平时 residual 必须非零");
    assert.ok(broken.notice && broken.notice.includes("总账借贷不平"));
  } finally {
    await closePool();
    await pool.end();
  }
});

test("财年列表按需补建，且中国财年恒等于自然年", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const { listFiscalYearsRoute } = await import("./fiscal-year.routes.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedEntries(pool, "2026", YEAR_2026);
    const capture = createResponseCapture();
    await listFiscalYearsRoute(
      { method: "GET", url: "/api/ledger/fiscal-years", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.readJson<{
      fiscalYears: { year: number; startDate: string; endDate: string; status: string }[];
    }>();
    assert.equal(result.statusCode, 200);

    const fy2026 = result.body!.fiscalYears.find((item) => item.year === 2026);
    assert.ok(fy2026, "有 2026 年账务活动就必须有 2026 财年行");
    assert.equal(fy2026.startDate, "2026-01-01");
    assert.equal(fy2026.endDate, "2026-12-31");
    assert.equal(fy2026.status, "open");

    // 数据库层也钉死自然年 —— 应用层写错年份边界会被 CHECK 挡回来
    await assert.rejects(
      pool.query(
        `insert into fiscal_years (id, company_id, year, start_date, end_date)
         values ('fy-bad', $1, 2030, '2030-04-01'::date, '2031-03-31'::date)`,
        [COMPANY_ID]
      ),
      /fiscal_years_natural_year_check/,
      "中国财年恒等于自然年，非自然年区间必须被数据库拒绝"
    );
  } finally {
    await closePool();
    await pool.end();
  }
});
