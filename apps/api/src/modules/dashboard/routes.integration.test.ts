/**
 * V8-B 任务 2：董事长驾驶舱与正式报表口径统一的 DB 集成回归。
 *
 * 覆盖：
 * - 期间过滤生效（`?period=YYYY-MM`，缺省当前期间），上期分录不再被算进「本月」；
 * - 同一份数据下 /v2/dashboard/chairman 与 /api/reports/profit-statement 净利润完全相等；
 * - 税负卡片保留符号（2221 借方余额＝留抵/多缴，必须显示为负数而不是 Math.abs 后的正数）；
 * - 余额类科目按期末时点累计取数，而非只取本期发生额；
 * - riskCount 取自风险引擎的未关闭发现数，而非 business_events 的阻塞条数。
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
const BUSINESS_EVENT_ID = "PUR-STD-001";
const DRAFT_ID = "dash-fixture-draft";
const VOUCHER_ID = "dash-fixture-voucher";

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
      return {
        statusCode,
        body: body ? (JSON.parse(body) as T) : null
      };
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
 * 期间内（2026-05）：收入 1000 + 300（6051，旧口径会漏计）、成本 400、费用 100 → 净利 800。
 * 期间外（2026-04）：收入 9999（旧实现无期间过滤会把它算进「本月」）、银行存款 700。
 * 余额类：2221 借方 500 → 留抵/多缴，税负必须呈现为负数。
 */
const ENTRY_FIXTURES: EntryFixture[] = [
  { id: "dash-le-1", entryDate: "2026-05-12", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "1000.00" },
  { id: "dash-le-2", entryDate: "2026-05-12", accountCode: "6051", accountName: "其他业务收入", debit: "0.00", credit: "300.00" },
  { id: "dash-le-3", entryDate: "2026-05-12", accountCode: "6001c", accountName: "主营业务成本", debit: "400.00", credit: "0.00" },
  { id: "dash-le-4", entryDate: "2026-05-12", accountCode: "6201", accountName: "销售费用", debit: "100.00", credit: "0.00" },
  { id: "dash-le-5", entryDate: "2026-05-12", accountCode: "1002", accountName: "银行存款", debit: "1300.00", credit: "0.00" },
  { id: "dash-le-6", entryDate: "2026-05-12", accountCode: "2221", accountName: "应交税费", debit: "500.00", credit: "0.00" },
  { id: "dash-le-7", entryDate: "2026-04-15", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "9999.00" },
  { id: "dash-le-8", entryDate: "2026-04-15", accountCode: "1002", accountName: "银行存款", debit: "700.00", credit: "0.00" }
];

async function seedLedgerFixtures(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1, $2, $3, 'accrual', 'approved', '驾驶舱夹具草稿')`,
    [DRAFT_ID, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, posted_at)
     values ($1, $2, $3, $4, 'accrual', '驾驶舱夹具凭证', 'posted', now())`,
    [VOUCHER_ID, COMPANY_ID, BUSINESS_EVENT_ID, DRAFT_ID]
  );
  for (const entry of ENTRY_FIXTURES) {
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, business_event_id, entry_date, summary,
         account_code, account_name, debit, credit
       ) values ($1, $2, $3, $4, $5::date, '驾驶舱夹具', $6, $7, $8::numeric, $9::numeric)`,
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

async function seedRiskFixtures(pool: pg.Pool): Promise<void> {
  const rows = [
    { id: "dash-risk-open-1", status: "open", severity: "high" },
    { id: "dash-risk-open-2", status: "open", severity: "medium" },
    { id: "dash-risk-resolved", status: "resolved", severity: "low" }
  ];
  for (const row of rows) {
    await pool.query(
      `insert into risk_findings (id, company_id, business_event_id, rule_code, severity, status, title, detail)
       values ($1, $2, $3, 'TEST_RULE', $4, $5, '夹具风险', '夹具明细')`,
      [row.id, COMPANY_ID, BUSINESS_EVENT_ID, row.severity, row.status]
    );
  }
}

interface DashboardBody {
  period: string;
  periodStartDate: string;
  periodEndDate: string;
  cards: Array<{ key: string; value: string; trend: string }>;
  profitOverview: { revenue: string; cost: string; expense: string; grossProfit: string; netProfit: string };
  riskCount: number;
}

async function fetchDashboard(periodQuery: string): Promise<DashboardBody> {
  const { handleChairmanDashboard } = await import("./routes.js");
  const capture = createResponseCapture();
  await handleChairmanDashboard(
    {
      method: "GET",
      url: `/v2/dashboard/chairman${periodQuery}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<DashboardBody>();
  assert.equal(result.statusCode, 200);
  assert.ok(result.body);
  return result.body as DashboardBody;
}

function cardValue(body: DashboardBody, key: string): string {
  return body.cards.find((card) => card.key === key)?.value ?? "";
}

function cardTrend(body: DashboardBody, key: string): string {
  return body.cards.find((card) => card.key === key)?.trend ?? "";
}

test("chairman dashboard scopes the profit overview to the requested accounting period", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    const may = await fetchDashboard("?period=2026-05");

    assert.equal(may.period, "2026-05");
    assert.equal(may.periodStartDate, "2026-05-01");
    assert.equal(may.periodEndDate, "2026-05-31");
    // 上期的 9999 收入不再被算进「本月」
    assert.equal(may.profitOverview.revenue, "1300");
    assert.equal(may.profitOverview.cost, "400");
    assert.equal(may.profitOverview.expense, "100");
    assert.equal(may.profitOverview.netProfit, "800");

    // 余额类科目按期末时点累计：本期 1300 + 上期 700
    assert.equal(cardValue(may, "cash"), "2,000");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("chairman dashboard net profit equals the formal profit statement for the same period", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { getProfitStatement } = await import("../reports/routes.js");
    const { closePool } = await import("../../db/client.js");

    const dashboard = await fetchDashboard("?period=2026-05");

    const statementCapture = createResponseCapture();
    await getProfitStatement(
      {
        method: "GET",
        url: "/api/reports/profit-statement?periodType=month&year=2026&month=5",
        auth: createAuthContext()
      } as ApiRequest,
      statementCapture.response
    );
    const statement = statementCapture.readJson<{
      totals: { revenue: string; cost: string; expenses: string; grossProfit: string; netProfit: string };
    }>();

    assert.equal(statement.statusCode, 200);
    // 首页 KPI 下钻到 /reports 时，老板必须看到同一个数字
    assert.equal(dashboard.profitOverview.netProfit, statement.body?.totals.netProfit);
    assert.equal(dashboard.profitOverview.revenue, statement.body?.totals.revenue);
    assert.equal(dashboard.profitOverview.cost, statement.body?.totals.cost);
    assert.equal(dashboard.profitOverview.expense, statement.body?.totals.expenses);
    assert.equal(dashboard.profitOverview.grossProfit, statement.body?.totals.grossProfit);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("chairman dashboard keeps the sign of a negative tax position instead of Math.abs", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    const dashboard = await fetchDashboard("?period=2026-05");

    // 2221 借方余额 500 = 留抵/多缴，不能显示成「要交 500」
    assert.equal(cardValue(dashboard, "tax"), "-500");
    // 上期（2026-04）没有 2221 分录 → 上期税负 0，环比 = -500 − 0
    assert.equal(cardTrend(dashboard, "tax"), "-500");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("chairman dashboard riskCount reports open risk-engine findings, not blocked business events", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    await seedRiskFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    const dashboard = await fetchDashboard("?period=2026-05");

    const blockedEvents = await pool.query<{ n: string }>(
      "select count(*)::text n from business_events where company_id = $1 and status = 'blocked'",
      [COMPANY_ID]
    );
    assert.equal(blockedEvents.rows[0]?.n, "0", "夹具中没有 blocked 事项，旧口径会得到 0");

    // 与 /api/risk/findings、/risk 页的「待处理」口径一致：仅 open 计数
    assert.equal(dashboard.riskCount, 2);
    assert.equal(cardValue(dashboard, "risk"), "2");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("chairman dashboard trend is a real month-over-month delta, not the card value with a sign", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    const may = await fetchDashboard("?period=2026-05");

    // 期末余额 2,000（本期 1,300 + 上期 700），上期期末 700 → 环比 +1,300。
    // 旧的 trendSign 会输出 `+2,000`（余额本身），本断言正是用来钉死这个差别。
    assert.equal(cardValue(may, "cash"), "2,000");
    assert.equal(cardTrend(may, "cash"), "+1,300");

    // 应收本期与上期都没有分录 → 余额未变，中性文案而不是 `+0`
    assert.equal(cardTrend(may, "receivables"), "持平");

    // 风险卡片没有历史快照可比，明确留白而不是把当前计数加个加号
    assert.equal(cardTrend(may, "risk"), "—");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("chairman dashboard degrades the trend when the requested period has no prior period data", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    // 2026-04 是夹具里最早的有账期间，2026-03 及以前完全没有分录
    const april = await fetchDashboard("?period=2026-04");

    assert.equal(cardValue(april, "cash"), "700");
    assert.equal(cardTrend(april, "cash"), "无上期数据");
    assert.equal(cardTrend(april, "tax"), "无上期数据");

    await closePool();
  } finally {
    await pool.end();
  }
});

/**
 * 时区隐患回归：PG `date` 若经 JS Date 往返，UTC+8 下 2026-06-01 会被映射成
 * 2026-05-31，于是每月 1 号的分录被算进上一期，报表与驾驶舱一起错。
 * 这里把进程时区切到 Asia/Shanghai 跑同一份数据，验证归期不受时区影响。
 */
test("ledger entry dates stay in the correct accounting period under a UTC+8 process time zone", async () => {
  await prepareDatabase();

  const originalTimeZone = process.env.TZ;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    // 每月 1 号是唯一会被前移到上一期的日子，因此专门造一条 6 月 1 日的收入
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, business_event_id, entry_date, summary,
         account_code, account_name, debit, credit
       ) values ($1, $2, $3, $4, '2026-06-01'::date, '跨期边界夹具', '6001', '主营业务收入', 0, 2500)`,
      ["dash-le-tz", COMPANY_ID, VOUCHER_ID, BUSINESS_EVENT_ID]
    );

    process.env.TZ = "Asia/Shanghai";
    // 守卫：确认时区切换真的生效，否则本用例会退化成一个恒真断言
    assert.equal(new Date("2026-06-01T00:00:00Z").getHours(), 8, "TZ=Asia/Shanghai 未生效");

    const { closePool } = await import("../../db/client.js");
    const june = await fetchDashboard("?period=2026-06");
    const may = await fetchDashboard("?period=2026-05");

    assert.equal(june.profitOverview.revenue, "2500", "6 月 1 日的收入必须留在 6 月");
    assert.equal(may.profitOverview.revenue, "1300", "6 月 1 日的收入不得被前移进 5 月");

    await closePool();
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
    await pool.end();
  }
});

test("chairman dashboard falls back to the current accounting period when no period is supplied", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool);
    const { closePool } = await import("../../db/client.js");

    const dashboard = await fetchDashboard("");

    assert.equal(dashboard.period, new Date().toISOString().slice(0, 7));
    // 当前期间没有夹具分录，盈利概览归零，但余额类仍按期末时点累计
    assert.equal(dashboard.profitOverview.revenue, "0");
    assert.equal(dashboard.profitOverview.netProfit, "0");
    assert.equal(cardValue(dashboard, "cash"), "2,000");

    await closePool();
  } finally {
    await pool.end();
  }
});
