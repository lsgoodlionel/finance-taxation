/**
 * 账簿口径增值税底稿的路径级断言。
 *
 * 汇总规则由 vat-ledger-paper.test.ts 钉住。这里测的是只有连上库才成立的部分：
 * 分录能否按 `account_type` 正确归入各专栏、本期口径有没有把往期的税带进来、
 * 两个口径的差额算不算得出来。
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
    userId: "usr-v4-tax",
    username: "v4_tax",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-tax"],
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

/** 造一条增值税科目的总账分录。voucher_id 非空，故一并建最小凭证。 */
async function seedVatEntry(
  pool: pg.Pool,
  params: { id: string; accountCode: string; debit: string; credit: string; entryDate: string }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  const period = params.entryDate.slice(0, 7);
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', '测试凭证', 'posted', 'test', $3::date, $4, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.entryDate, period]
  );
  const name = await pool.query<{ name: string }>(
    `select name from accounts where company_id = $1 and code = $2`,
    [COMPANY_ID, params.accountCode]
  );
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, business_event_id, entry_date, summary,
       account_code, account_name, debit, credit, source, posted_at
     ) values ($1, $2, $3, null, $4::date, '测试分录', $5, $6, $7::numeric, $8::numeric,
               'voucher_posting', now())`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.entryDate,
      params.accountCode,
      name.rows[0]?.name ?? params.accountCode,
      params.debit,
      params.credit
    ]
  );
}

async function getLedgerPaper(period: string) {
  const { getLedgerVatWorkingPaper } = await import("./vat-ledger-paper.routes.js");
  const capture = createResponseCapture();
  await getLedgerVatWorkingPaper(
    {
      method: "GET",
      url: `/api/tax/vat-working-paper/ledger?period=${period}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("账簿口径增值税底稿的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  // 2026-06：销项 1300、进项 390、进项转出 100、已交税金 200
  await seedVatEntry(pool, { id: "le-out-1", accountCode: "222101", debit: "0.00", credit: "1300.00", entryDate: "2026-06-10" });
  await seedVatEntry(pool, { id: "le-in-1", accountCode: "222102", debit: "390.00", credit: "0.00", entryDate: "2026-06-12" });
  await seedVatEntry(pool, { id: "le-out-2", accountCode: "222107", debit: "0.00", credit: "100.00", entryDate: "2026-06-20" });
  await seedVatEntry(pool, { id: "le-paid-1", accountCode: "222108", debit: "200.00", credit: "0.00", entryDate: "2026-06-25" });
  // 上期的销项，不该出现在本期底稿里
  await seedVatEntry(pool, { id: "le-out-prev", accountCode: "222101", debit: "0.00", credit: "9999.00", entryDate: "2026-05-10" });

  await t.test("按 account_type 归入各专栏", async () => {
    const res = await getLedgerPaper("2026-06");
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));

    assert.equal(res.body?.ledger.outputTax, "1300.00");
    assert.equal(res.body?.ledger.inputTax, "390.00");
    assert.equal(res.body?.ledger.inputTransferOut, "100.00");
    assert.equal(res.body?.ledger.taxPaid, "200.00");
  });

  await t.test("应纳税额 = 销项 − 进项 + 转出，不减已交税金", async () => {
    const res = await getLedgerPaper("2026-06");
    assert.equal(
      res.body?.ledger.payable,
      "1010.00",
      "1300 − 390 + 100；已缴的 200 单独列示，不是应纳税额的减项"
    );
  });

  await t.test("本期口径：上期的税不进本期底稿", async () => {
    const res = await getLedgerPaper("2026-06");
    const entryIds = (res.body?.ledger.lines as { entryId: string }[]).map((line) => line.entryId);
    assert.ok(!entryIds.includes("le-out-prev"), "混用累计口径会让底稿把开业至今的税重报一遍");

    const may = await getLedgerPaper("2026-05");
    assert.equal(may.body?.ledger.outputTax, "9999.00", "上期底稿仍能查到上期的数");
  });

  await t.test("每行可追溯到凭证", async () => {
    const res = await getLedgerPaper("2026-06");
    const line = (res.body?.ledger.lines as any[]).find((item) => item.entryId === "le-out-1");
    assert.equal(line.voucherId, "vch-le-out-1");
    assert.equal(line.entryDate, "2026-06-10");
    assert.equal(line.accountCode, "222101");
  });

  await t.test("红冲后本期净额归零", async () => {
    await seedVatEntry(pool, { id: "le-out-1-rev", accountCode: "222101", debit: "1300.00", credit: "0.00", entryDate: "2026-06-28" });
    const res = await getLedgerPaper("2026-06");
    assert.equal(res.body?.ledger.outputTax, "0.00", "只取贷方的话红冲等于没发生");
    assert.equal(res.body?.ledger.payable, "-290.00", "0 − 390 + 100");
  });

  await t.test("与税目口径的差额被算出来并说明方向", async () => {
    const res = await getLedgerPaper("2026-06");
    const recon = res.body?.reconciliation;
    assert.equal(typeof recon.message, "string");
    // 种子数据里本期没有匹配的税目记录，账簿有负数应纳税额 → 差额为负方向的说明
    assert.equal(recon.consistent, false);
    assert.match(String(recon.message), /不会自动抹平|无法与账簿对差/);
  });

  await t.test("期间格式非法直接拒绝", async () => {
    const res = await getLedgerPaper("2026-6");
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.code, "PERIOD_INVALID");
  });
});
