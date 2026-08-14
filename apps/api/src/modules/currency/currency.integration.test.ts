/**
 * 多币种的路径级验证（V12-D5）。
 *
 * 调汇规则由 revaluation.test.ts 逐条钉住，这里测的是取数与接线：外币余额汇总
 * 得对不对、汇率取的是不是「该日或之前最近一天」、缺汇率会不会挡住、生成的凭证
 * 借贷平不平。
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
    readJson() {
      return { statusCode, body: body ? (JSON.parse(body) as Record<string, any>) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function putRate(body: Record<string, unknown>) {
  const { upsertExchangeRateRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await upsertExchangeRateRoute(
    { method: "PUT", url: "/api/currency/rates", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function preview(asOfDate: string) {
  const { previewRevaluationRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await previewRevaluationRoute(
    {
      method: "GET",
      url: `/api/currency/revaluation?asOfDate=${asOfDate}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function createVoucher(asOfDate: string) {
  const { createRevaluationVoucherRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await createRevaluationVoucherRoute(
    {
      method: "POST",
      url: "/api/currency/revaluation",
      auth: createAuthContext(),
      body: { asOfDate }
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

/** 造一笔外币分录：本位币金额进 debit/credit，原币三元组另存。 */
async function seedForeignEntry(
  pool: pg.Pool,
  params: {
    id: string;
    accountCode: string;
    accountName: string;
    entryDate: string;
    currency: string;
    originalAmount: string;
    rate: number;
    side: "debit" | "credit";
  }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  const baseAmount = ((Number(params.originalAmount) * params.rate) / 1_000_000).toFixed(2);
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', '外币业务', 'posted', 'test', $3::date, $4, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.entryDate, params.entryDate.slice(0, 7)]
  );
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, entry_date, summary, account_code, account_name,
       debit, credit, source, posted_at, currency, original_amount, exchange_rate
     ) values ($1, $2, $3, $4::date, '外币业务', $5, $6, $7::numeric, $8::numeric,
               'voucher_posting', now(), $9, $10::numeric, $11)`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.entryDate,
      params.accountCode,
      params.accountName,
      params.side === "debit" ? baseAmount : "0.00",
      params.side === "credit" ? baseAmount : "0.00",
      params.currency,
      params.originalAmount,
      params.rate
    ]
  );
}

test("汇率维护与期末调汇的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("本位币不能录汇率", async () => {
    const rejected = await putRate({ currency: "CNY", rateDate: "2026-06-30", rate: 1 });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "CURRENCY_IS_BASE");
  });

  await t.test("币种码必须是三字母 ISO 码", async () => {
    const rejected = await putRate({ currency: "美元", rateDate: "2026-06-30", rate: 7 });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "CURRENCY_INVALID");
  });

  await t.test("录入汇率：小数进、整数标度存、两种形式都返回", async () => {
    const saved = await putRate({ currency: "USD", rateDate: "2026-05-31", rate: 7.0 });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body?.rate, 7_000_000);
    assert.equal(saved.body?.rateDisplay, "7.000000");
  });

  await t.test("同日同币种再录是更新而非新增一行", async () => {
    await putRate({ currency: "USD", rateDate: "2026-05-31", rate: 7.05, note: "改正录入错误" });
    const rows = await pool.query<{ count: string }>(
      `select count(*)::text from exchange_rates where company_id = $1 and currency = 'USD' and rate_date = '2026-05-31'`,
      [COMPANY_ID]
    );
    assert.equal(rows.rows[0]?.count, "1", "插入第二行会让取数靠 order by 撞运气");
  });

  await t.test("外币余额进得了调汇预览，且缺汇率会挡住", async () => {
    // 5-20 收到 1000 USD 货款，当时 7.00 → 账面 7000 CNY
    await seedForeignEntry(pool, {
      id: "le-fx-1",
      accountCode: "1002",
      accountName: "银行存款-美元户",
      entryDate: "2026-05-20",
      currency: "USD",
      originalAmount: "1000.00",
      rate: 7_000_000,
      side: "debit"
    });

    // 6-30 还没录汇率 → 预览要报缺口而不是静默按 0 处理
    const blocked = await preview("2026-06-30");
    assert.equal(blocked.statusCode, 200);
    assert.deepEqual(blocked.body?.missingRates, [], "5-31 的汇率可作为 6-30 的兜底（取该日或之前最近一天）");

    const line = (blocked.body?.lines as any[]).find((l) => l.accountCode === "1002");
    assert.equal(line.currency, "USD");
    assert.equal(line.foreignBalance, "1000.00");
    assert.equal(line.baseBookBalance, "7000.00");
    assert.equal(line.closingRate, "7.050000", "用的是 5-31 那条最近汇率");
  });

  await t.test("汇率取「该日或之前最近一天」，不是「恰好当天」", async () => {
    await putRate({ currency: "USD", rateDate: "2026-06-30", rate: 7.2 });
    const p = await preview("2026-06-30");
    const line = (p.body?.lines as any[]).find((l) => l.accountCode === "1002");
    assert.equal(line.closingRate, "7.200000");
    // 1000 USD × 7.20 = 7200，账面 7000 → 差 +200
    assert.equal(line.difference, "200.00");
    assert.equal(line.needsAdjustment, true);
    assert.equal(line.isGain, true, "资产类外币升值是收益");
  });

  await t.test("未维护汇率的币种被明确列出，且整张凭证不生成", async () => {
    await seedForeignEntry(pool, {
      id: "le-fx-eur",
      accountCode: "2202",
      accountName: "应付账款-欧元",
      entryDate: "2026-06-10",
      currency: "EUR",
      originalAmount: "500.00",
      rate: 8_000_000,
      side: "credit"
    });

    const p = await preview("2026-06-30");
    assert.deepEqual(p.body?.missingRates, ["EUR"]);

    const rejected = await createVoucher("2026-06-30");
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "EXCHANGE_RATE_MISSING");
    assert.match(String(rejected.body?.error), /EUR/, "错误信息要点名是哪个币种缺");
  });

  await t.test("补齐汇率后生成草稿凭证，借贷平衡", async () => {
    await putRate({ currency: "EUR", rateDate: "2026-06-30", rate: 7.9 });

    const created = await createVoucher("2026-06-30");
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(created.body?.status, "draft", "系统生成的凭证一律 draft，由人复核过账");

    const lines = await pool.query<{ debit: string; credit: string; account_code: string }>(
      `select account_code, debit::text, credit::text from voucher_lines where voucher_id = $1 order by sort_order`,
      [created.body?.voucherId]
    );
    const totalDebit = lines.rows.reduce((sum, r) => sum + Number(r.debit), 0);
    const totalCredit = lines.rows.reduce((sum, r) => sum + Number(r.credit), 0);
    assert.equal(totalDebit.toFixed(2), totalCredit.toFixed(2), "调汇凭证必须借贷平衡");

    const codes = lines.rows.map((r) => r.account_code);
    assert.ok(codes.includes("660303"), "对手方是财务费用-汇兑损益");
    assert.ok(codes.includes("1002") && codes.includes("2202"), "两个外币科目都要调");

    // 汇兑损益只有一行：一次调汇是一个整体动作，逐笔拆开会让明细账多出一堆
    // 金额琐碎、业务含义相同的分录
    assert.equal(codes.filter((c) => c === "660303").length, 1);
  });

  await t.test("没有需要调整的外币余额时明确拒绝，而不是生成空凭证", async () => {
    // 换一个没有外币业务的日期：2026-01-31 时还没有任何外币分录
    const rejected = await createVoucher("2026-01-31");
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "REVALUATION_NOT_NEEDED");
  });

  await t.test("数据库挡住不完整的外币分录", async () => {
    // 币种是外币却没有原币金额与汇率——这笔分录无法参与调汇，
    // 也回答不了「当初按什么汇率入的账」
    await assert.rejects(
      pool.query(
        `insert into ledger_entries (
           id, company_id, voucher_id, entry_date, summary, account_code, account_name,
           debit, credit, source, posted_at, currency
         ) values ('le-fx-bad', $1, 'vch-le-fx-1', '2026-06-30'::date, '坏分录', '1002', '银行存款',
                   100, 0, 'voucher_posting', now(), 'USD')`,
        [COMPANY_ID]
      ),
      /ledger_entries_currency_consistency|violates check constraint/
    );
  });
});
