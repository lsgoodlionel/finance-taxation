/**
 * V11 CRITICAL：结转损益不得让「已结转期间」的损益读路径塌成 0。
 *
 * `closePeriod` 把结转分录写进 `ledger_entries`，`entry_date` 取期末日（落在被结转
 * 的期间之内）、`source = 'period_closing'`，金额与该期间业务分录恰好相反。任何
 * 「按期间聚合损益」的读路径若不排除这批分录，结转之后该期间的收入/成本/费用/
 * 净利会全部归零 —— 而且是静默的，没有任何报错。月结是常规操作。
 *
 * 本文件的核心断言形态固定为三段式，这是这个缺陷唯一可靠的回归方式：
 *   1. 造业务分录 → 2. 断言各损益读路径的数字正确 → 3. 执行 closePeriod
 *   → 4. **原样再断言一遍，数字必须一个不变**。
 *
 * 同时钉死两条不得被"顺手修掉"的反向要求：
 *   - 账簿列示（科目余额表）必须**看得见**结转分录，且结转后 6xxx 归零、3131 承载利润；
 *   - 资产负债表在「未结转 / 全部结转 / 部分结转」三种状态下都必须恒平。
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
const DRAFT_ID = "close-fixture-draft";
const VOUCHER_ID = "close-fixture-voucher";

const MAY = "2026-05";
const MAY_END = "2026-05-31";
const JUNE_END = "2026-06-30";

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
 * 2026-05 的业务分录，每张凭证自身借贷平衡（资产负债表恒平断言依赖这一点）：
 *   银行存款 1300      / 主营业务收入 1000 + 其他业务收入 300
 *   主营业务成本 400   / 库存商品 400
 *   销售费用 100       / 银行存款 100
 *   所得税费用 60      / 应交税费 60
 *
 * 利润表口径：收入 1300、成本 400、费用 100、所得税 60
 *            → 毛利 900、利润总额 800、净利润 740。
 *
 * 2026-06 再放一笔未结转的收入 500，用来构造「部分结转」这一月结后的常态：
 * 5 月已结转（3131 有余额），6 月未结转（6xxx 有余额），资产负债表必须仍然恒平。
 */
const MAY_ENTRIES: EntryFixture[] = [
  { id: "cp-le-1", entryDate: "2026-05-12", accountCode: "1002", accountName: "银行存款", debit: "1300.00", credit: "0.00" },
  { id: "cp-le-2", entryDate: "2026-05-12", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "1000.00" },
  { id: "cp-le-3", entryDate: "2026-05-12", accountCode: "6051", accountName: "其他业务收入", debit: "0.00", credit: "300.00" },
  { id: "cp-le-4", entryDate: "2026-05-13", accountCode: "6001c", accountName: "主营业务成本", debit: "400.00", credit: "0.00" },
  { id: "cp-le-5", entryDate: "2026-05-13", accountCode: "1405", accountName: "库存商品", debit: "0.00", credit: "400.00" },
  { id: "cp-le-6", entryDate: "2026-05-14", accountCode: "6201", accountName: "销售费用", debit: "100.00", credit: "0.00" },
  { id: "cp-le-7", entryDate: "2026-05-14", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "100.00" },
  { id: "cp-le-8", entryDate: "2026-05-20", accountCode: "6801", accountName: "所得税费用", debit: "60.00", credit: "0.00" },
  { id: "cp-le-9", entryDate: "2026-05-20", accountCode: "2221", accountName: "应交税费", debit: "0.00", credit: "60.00" }
];

const JUNE_ENTRIES: EntryFixture[] = [
  { id: "cp-le-10", entryDate: "2026-06-10", accountCode: "1002", accountName: "银行存款", debit: "500.00", credit: "0.00" },
  { id: "cp-le-11", entryDate: "2026-06-10", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "500.00" }
];

async function seedLedgerFixtures(pool: pg.Pool, entries: EntryFixture[]): Promise<void> {
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1, $2, $3, 'accrual', 'approved', '结转回归夹具草稿')
     on conflict (id) do nothing`,
    [DRAFT_ID, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, posted_at)
     values ($1, $2, $3, $4, 'accrual', '结转回归夹具凭证', 'posted', now())
     on conflict (id) do nothing`,
    [VOUCHER_ID, COMPANY_ID, BUSINESS_EVENT_ID, DRAFT_ID]
  );
  for (const entry of entries) {
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, business_event_id, entry_date, summary,
         account_code, account_name, debit, credit
       ) values ($1, $2, $3, $4, $5::date, '结转回归夹具', $6, $7, $8::numeric, $9::numeric)`,
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

/**
 * 一张 2026-05 的销项发票：不含税额 1300（= 账面收入），税额 0。
 *
 * 税额取 0 是刻意的：申报数当前恒为 0 占位，销项税额一栏因此永远一致，
 * 于是「票账收入差异」成为 overall 的唯一变量 —— 账面收入正确则 overall = ok，
 * 账面收入被结转分录冲成 0 则差异 130000 分（> 默认告警阈值 10000 分）→ alert。
 */
async function seedInvoiceFixture(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into invoices (
       id, company_id, direction, invoice_type, invoice_no, invoice_date,
       seller_name, amount, tax_amount, total_amount, tax_rate
     ) values ($1, $2, 'output', 'vat_special', 'INV-CP-001', '2026-05-12'::date,
       '测试公司', 1300, 0, 1300, 0)`,
    ["cp-inv-1", COMPANY_ID]
  );
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

// ─── 各损益读路径的取数封装（结转前后各调一次，断言完全一致） ────────────────

interface ProfitTotals {
  revenue: string;
  cost: string;
  expenses: string;
  grossProfit: string;
  totalProfit: string;
  incomeTax: string;
  netProfit: string;
}

async function fetchProfitStatement(): Promise<ProfitTotals> {
  const { getProfitStatement } = await import("../reports/routes.js");
  const capture = createResponseCapture();
  await getProfitStatement(
    {
      method: "GET",
      url: "/api/reports/profit-statement?periodType=month&year=2026&month=5",
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{ totals: ProfitTotals }>();
  assert.equal(result.statusCode, 200);
  return result.body!.totals;
}

async function fetchDashboardProfitOverview(): Promise<Record<string, string>> {
  const { handleChairmanDashboard } = await import("../dashboard/routes.js");
  const capture = createResponseCapture();
  await handleChairmanDashboard(
    {
      method: "GET",
      url: `/v2/dashboard/chairman?period=${MAY}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{ profitOverview: Record<string, string> }>();
  assert.equal(result.statusCode, 200);
  return result.body!.profitOverview;
}

async function fetchBalanceSheet(asOfDate: string) {
  const { getBalanceSheet } = await import("../reports/routes.js");
  const [year, month] = [asOfDate.slice(0, 4), Number(asOfDate.slice(5, 7))];
  const capture = createResponseCapture();
  await getBalanceSheet(
    {
      method: "GET",
      url: `/api/reports/balance-sheet?periodType=month&year=${year}&month=${month}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{
    equity: Array<{ code: string; amount: string }>;
    totals: { assets: string; liabilities: string; equity: string; liabilitiesAndEquity: string };
  }>();
  assert.equal(result.statusCode, 200);
  return result.body!;
}

async function fetchRevenueComparison(): Promise<{ current: number; previous: number }> {
  const { revenueComparisonRoute } = await import("../analytics/routes.js");
  const capture = createResponseCapture();
  await revenueComparisonRoute(
    {
      method: "GET",
      url: "/api/analytics/revenue-comparison?current=2026-06&previous=2026-05",
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{ current: number; previous: number }>();
  assert.equal(result.statusCode, 200);
  return { current: result.body!.current, previous: result.body!.previous };
}

async function fetchBudgetVarianceActual(): Promise<number> {
  const { budgetVarianceRoute } = await import("../analytics/routes.js");
  const capture = createResponseCapture();
  await budgetVarianceRoute(
    {
      method: "GET",
      url: `/api/analytics/budget-variance?period=${MAY}&budget=1000`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{ actualCents: number }>();
  assert.equal(result.statusCode, 200);
  return result.body!.actualCents;
}

async function fetchCorporateIncomeTax(): Promise<{
  accountingProfit: string;
  taxableIncomeEstimate: string;
  prepaymentTaxEstimate: string;
}> {
  const { getCorporateIncomeTaxPreparation } = await import("../tax/routes.js");
  const capture = createResponseCapture();
  await getCorporateIncomeTaxPreparation(
    {
      method: "GET",
      url: `/api/tax/corporate-income-tax?filingPeriod=${MAY}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{
    accountingProfit: string;
    taxableIncomeEstimate: string;
    prepaymentTaxEstimate: string;
  }>();
  assert.equal(result.statusCode, 200);
  return result.body!;
}

async function fetchTaxConsistency(): Promise<{
  overall: string;
  ledgerRevenueCents: number;
}> {
  const { taxConsistencyRoute } = await import("../tax-integration/consistency.routes.js");
  const capture = createResponseCapture();
  await taxConsistencyRoute(
    {
      method: "GET",
      url: `/api/tax-integration/consistency?period=${MAY}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{
    overall: string;
    checks: Array<{ key: string; comparedValueCents: number }>;
  }>();
  assert.equal(result.statusCode, 200);
  const revenueCheck = result.body!.checks.find((c) => c.key === "invoice_vs_ledger_revenue");
  return {
    overall: result.body!.overall,
    ledgerRevenueCents: revenueCheck!.comparedValueCents
  };
}

async function fetchClosePlanConsistency(): Promise<string | null> {
  const { closePlanRoute } = await import("./close-plan.routes.js");
  const capture = createResponseCapture();
  await closePlanRoute(
    {
      method: "GET",
      url: `/api/ledger/close-plan?period=${MAY}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<{ facts: { taxConsistencyOverall: string | null } }>();
  assert.equal(result.statusCode, 200);
  return result.body!.facts.taxConsistencyOverall;
}

// ─── 主回归：结转前后所有损益读路径的数字必须一模一样 ────────────────────────

test("period closing must not zero out any profit-and-loss read path for the closed period", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool, [...MAY_ENTRIES, ...JUNE_ENTRIES]);
    await seedInvoiceFixture(pool);
    const { closePool } = await import("../../db/client.js");

    // ── 1. 结转前：确认夹具本身算出来就是对的 ────────────────────────────
    const statementBefore = await fetchProfitStatement();
    assert.equal(statementBefore.revenue, "1300");
    assert.equal(statementBefore.cost, "400");
    assert.equal(statementBefore.expenses, "100");
    assert.equal(statementBefore.grossProfit, "900");
    assert.equal(statementBefore.totalProfit, "800");
    assert.equal(statementBefore.incomeTax, "60");
    assert.equal(statementBefore.netProfit, "740");

    const dashboardBefore = await fetchDashboardProfitOverview();
    assert.equal(dashboardBefore.revenue, "1300");
    assert.equal(dashboardBefore.netProfit, "740");

    const comparisonBefore = await fetchRevenueComparison();
    assert.equal(comparisonBefore.previous, 1300, "2026-05 收入");
    assert.equal(comparisonBefore.current, 500, "2026-06 收入");

    const budgetActualBefore = await fetchBudgetVarianceActual();
    assert.equal(budgetActualBefore, 10_000, "销售费用 100 元 = 10000 分");

    const citBefore = await fetchCorporateIncomeTax();
    assert.equal(citBefore.accountingProfit, "800");
    assert.equal(citBefore.taxableIncomeEstimate, "800");
    assert.equal(citBefore.prepaymentTaxEstimate, "200");

    const consistencyBefore = await fetchTaxConsistency();
    assert.equal(consistencyBefore.ledgerRevenueCents, 130_000);
    assert.equal(consistencyBefore.overall, "ok");

    assert.equal(await fetchClosePlanConsistency(), "ok");

    // ── 2. 执行结转 ──────────────────────────────────────────────────────
    const closing = await runClosePeriod(MAY, MAY_END);
    assert.equal(closing.alreadyClosed, false);
    assert.equal(closing.netProfit, 740, "结转进 3131 的金额必须等于利润表净利润");
    // 6001 / 6051 / 6001c / 6201 / 6801 五个损益科目 + 3131 平衡腿
    assert.equal(closing.lineCount, 6);

    // 守卫：确认结转分录真的落在被结转期间之内（缺陷成立的前提）。
    // 若将来 closePeriod 改成把 entry_date 记到下期期初，本断言会先失败提醒，
    // 而不是让下面一整批"数字不变"的断言退化成恒真。
    const closingRows = await pool.query<{ n: string }>(
      `select count(*)::text n from ledger_entries
       where company_id = $1 and source = 'period_closing'
         and entry_date between '2026-05-01' and '2026-05-31'`,
      [COMPANY_ID]
    );
    assert.equal(closingRows.rows[0]?.n, "6", "结转分录必须落在被结转期间之内");

    // ── 3. 结转后：逐条原样再断言一遍，数字一个都不许变 ──────────────────
    const statementAfter = await fetchProfitStatement();
    assert.deepEqual(statementAfter, statementBefore, "利润表：结转后必须与结转前完全一致");

    const dashboardAfter = await fetchDashboardProfitOverview();
    assert.deepEqual(dashboardAfter, dashboardBefore, "驾驶舱盈利概览：结转后必须完全一致");

    assert.deepEqual(
      await fetchRevenueComparison(),
      comparisonBefore,
      "收入环比：结转后必须完全一致"
    );
    assert.equal(await fetchBudgetVarianceActual(), budgetActualBefore, "预算实际发生额");
    assert.deepEqual(await fetchCorporateIncomeTax(), citBefore, "企业所得税应纳税所得额");
    assert.deepEqual(await fetchTaxConsistency(), consistencyBefore, "票税一致性核对");
    assert.equal(await fetchClosePlanConsistency(), "ok", "结账向导里的票税一致性");

    await closePool();
  } finally {
    await pool.end();
  }
});

// ─── 反向要求：账簿列示必须看得见结转分录 ────────────────────────────────────

test("period closing entries stay visible in the account-balance ledger view", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool, MAY_ENTRIES);
    const { getLedgerBalances } = await import("./routes.js");
    const { closePool } = await import("../../db/client.js");

    await runClosePeriod(MAY, MAY_END);

    const capture = createResponseCapture();
    await getLedgerBalances(
      { method: "GET", url: "/api/ledger/balances", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.readJson<{
      items: Array<{ accountCode: string; balance: string }>;
    }>();
    assert.equal(result.statusCode, 200);

    const balanceOf = (code: string) =>
      result
        .body!.items.filter((item) => item.accountCode === code)
        .reduce((sum, item) => sum + Number(item.balance), 0);

    // 科目余额表是「账簿列示」，不排除结转分录 —— 正因如此才能呈现结转后的正确结果：
    // 损益科目全部归零，3131 本年利润承载 740（贷方余额，debit − credit = −740）。
    assert.equal(balanceOf("6001"), 0, "结转后主营业务收入必须归零");
    assert.equal(balanceOf("6051"), 0, "结转后其他业务收入必须归零");
    assert.equal(balanceOf("6001c"), 0, "结转后主营业务成本必须归零");
    assert.equal(balanceOf("6201"), 0, "结转后销售费用必须归零");
    assert.equal(balanceOf("6801"), 0, "结转后所得税费用必须归零");
    assert.equal(balanceOf("3131"), -740, "本年利润承载净利润，且必须出现在账簿里");

    // 试算平衡：全部分录（含结转分录）借贷合计必须相等。若哪天有人"顺手"
    // 在账簿读路径上加了排除过滤，这条会立刻失败。
    const total = result.body!.items.reduce((sum, item) => sum + Number(item.balance), 0);
    assert.ok(Math.abs(total) < 0.0001, `账簿必须完整且试算平衡，实际净额 ${total}`);

    await closePool();
  } finally {
    await pool.end();
  }
});

// ─── 反向要求：资产负债表在三种结转状态下都必须恒平 ──────────────────────────

test("balance sheet stays balanced before closing, after closing, and half-closed", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool, [...MAY_ENTRIES, ...JUNE_ENTRIES]);
    const { closePool } = await import("../../db/client.js");

    const assertBalanced = (
      sheet: Awaited<ReturnType<typeof fetchBalanceSheet>>,
      label: string
    ) => {
      assert.equal(
        sheet.totals.assets,
        sheet.totals.liabilitiesAndEquity,
        `${label}：资产必须等于负债加所有者权益`
      );
      const profitLines = sheet.equity.filter((line) => line.code === "3131");
      assert.equal(profitLines.length, 1, `${label}：本年利润只能出现一行，不得重复计量`);
    };

    // ── 状态 A：完全未结转。3131 无账面余额，全部利润由合成行承载。
    const beforeMay = await fetchBalanceSheet(MAY_END);
    assertBalanced(beforeMay, "未结转");
    assert.equal(beforeMay.equity.find((l) => l.code === "3131")?.amount, "740");
    // 资产 = 银行 1200 + 库存商品 −400 = 800；负债 = 应交税费 60；权益 = 740
    assert.equal(beforeMay.totals.assets, "800");

    await runClosePeriod(MAY, MAY_END);

    // ── 状态 B：当期全部结转。3131 有账面余额 740，未结转利润为 0。
    const afterMay = await fetchBalanceSheet(MAY_END);
    assertBalanced(afterMay, "已结转");
    assert.equal(afterMay.equity.find((l) => l.code === "3131")?.amount, "740");
    assert.equal(afterMay.totals.assets, "800");
    assert.deepEqual(afterMay.totals, beforeMay.totals, "结转不改变资产负债表任何合计");

    // ── 状态 C：部分结转（月结之后的常态，也是旧实现真正翻车的地方）。
    // 5 月已结转（3131 账面 740），6 月未结转（6001 尚有 500）。
    // 旧实现会先无条件 push 一行合成的 3131 = 500，循环里又 push 一行 740 + 500，
    // 权益虚增 500 → 资产 1300 vs 负债+权益 1800。
    const halfClosed = await fetchBalanceSheet(JUNE_END);
    assertBalanced(halfClosed, "部分结转");
    assert.equal(
      halfClosed.equity.find((l) => l.code === "3131")?.amount,
      "1240",
      "本年利润 = 已结转的 740 + 尚未结转的 500"
    );
    assert.equal(halfClosed.totals.assets, "1300");
    assert.equal(halfClosed.totals.liabilitiesAndEquity, "1300");

    await closePool();
  } finally {
    await pool.end();
  }
});

// ─── 幂等：重复结转不得再叠一层 ─────────────────────────────────────────────

test("closing the same period twice keeps the profit statement stable", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedLedgerFixtures(pool, MAY_ENTRIES);
    const { closePool } = await import("../../db/client.js");

    await runClosePeriod(MAY, MAY_END);
    const second = await runClosePeriod(MAY, MAY_END);
    assert.equal(second.alreadyClosed, true);
    assert.equal(second.netProfit, 740);

    const statement = await fetchProfitStatement();
    assert.equal(statement.revenue, "1300");
    assert.equal(statement.netProfit, "740");

    await closePool();
  } finally {
    await pool.end();
  }
});
