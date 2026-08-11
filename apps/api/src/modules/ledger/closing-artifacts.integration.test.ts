/**
 * V12 收尾三项的路径级断言。
 *
 * 1. `ledger_entries.source` 的 CHECK 约束（迁移 067）
 * 2. 期末结转与年末结转补写 `voucher_lines`（此前凭证详情页是空的）
 * 3. 资产负债表自检随报表一起返回（此前只在单独的接口里）
 *
 * 三件事凑一个 spec，是因为它们共同回答同一个问题：**系统生成的那几张凭证与
 * 报表，用户点开时看到的是不是完整的**。
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

test("V12 收尾：来源约束、结转凭证行、报表自检", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("source 只接受已知取值，写错一个字母立刻报错", async () => {
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
       values ('vch-src-test', $1, 'general', '测试', 'posted', 'test', '2026-06-30'::date, '2026-06', now())`,
      [COMPANY_ID]
    );

    // 'period_close'（少了 ing）在旧 schema 下会被静默接受，
    // 于是这条分录悄悄换了身份：本该被利润表排除的，进了利润表
    await assert.rejects(
      pool.query(
        `insert into ledger_entries (
           id, company_id, voucher_id, business_event_id, entry_date, summary,
           account_code, account_name, debit, credit, source, posted_at
         ) values ('le-bad-src', $1, 'vch-src-test', null, '2026-06-30'::date, '摘要',
                   '6001', '主营业务收入', 0, 100, 'period_close', now())`,
        [COMPANY_ID]
      ),
      /ledger_entries_source_check|violates check constraint/
    );
  });

  await t.test("四个已知取值都放行", async () => {
    // 不测 NULL：这一列本身是 NOT NULL（001 建表时就是），
    // 约束里的 `source is null` 分支实际不可达。
    for (const [index, source] of [
      "voucher_posting",
      "period_closing",
      "annual_closing",
      "opening_balance"
    ].entries()) {
      await pool.query(
        `insert into ledger_entries (
           id, company_id, voucher_id, business_event_id, entry_date, summary,
           account_code, account_name, debit, credit, source, posted_at
         ) values ($2, $1, 'vch-src-test', null, '2026-06-30'::date, '摘要',
                   '6001', '主营业务收入', 0, 1, $3, now())`,
        [COMPANY_ID, `le-src-ok-${index}`, source]
      );
    }
    const rows = await pool.query(
      `select count(*)::text as n from ledger_entries where id like 'le-src-ok-%'`
    );
    assert.equal(rows.rows[0]?.n, "4");
  });

  await t.test("期末结转凭证的详情页不再是空的", async () => {
    const { withTransaction } = await import("../../db/client.js");
    const { closePeriod } = await import("./close-period.js");

    // 造一笔本期损益，让结转有东西可转
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
       values ('vch-rev-1', $1, 'general', '销售收入', 'posted', 'test', '2026-07-10'::date, '2026-07', now())`,
      [COMPANY_ID]
    );
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, business_event_id, entry_date, summary,
         account_code, account_name, debit, credit, source, posted_at
       ) values
         ('le-rev-1', $1, 'vch-rev-1', null, '2026-07-10'::date, '销售收入',
          '1002', '银行存款', 1000, 0, 'voucher_posting', now()),
         ('le-rev-2', $1, 'vch-rev-1', null, '2026-07-10'::date, '销售收入',
          '6001', '主营业务收入', 0, 1000, 'voucher_posting', now())`,
      [COMPANY_ID]
    );

    const result = await withTransaction((client) =>
      closePeriod(client, {
        companyId: COMPANY_ID,
        periodLabel: "2026-07",
        asOfDate: "2026-07-31",
        now: new Date().toISOString()
      })
    );
    assert.ok(result.voucherId, JSON.stringify(result));

    const lines = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit::text, credit::text from voucher_lines
       where voucher_id = $1 order by sort_order`,
      [result.voucherId]
    );
    assert.ok(
      lines.rowCount && lines.rowCount > 0,
      "此前只写 ledger_entries，用户点开每期金额最大的这张凭证只看到一张空凭证"
    );

    // 凭证行与总账分录必须逐笔一致——两处不同就说明有一处漏写或写错
    const entries = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit::text, credit::text from ledger_entries
       where voucher_id = $1 order by account_code`,
      [result.voucherId]
    );
    assert.equal(lines.rowCount, entries.rowCount);
    const sum = (rows: typeof lines.rows) =>
      rows.reduce((acc, row) => acc + Number(row.debit) + Number(row.credit), 0);
    assert.equal(sum(lines.rows), sum(entries.rows));
  });

  await t.test("资产负债表随报表返回恒等式自检", async () => {
    const { getBalanceSheet } = await import("../reports/routes.js");
    const capture = createResponseCapture();
    await getBalanceSheet(
      {
        method: "GET",
        url: "/api/reports/balance-sheet?periodType=month&year=2026&month=7",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response
    );
    const res = capture.readJson();

    assert.equal(res.statusCode, 200);
    assert.ok(res.body?.selfCheck, "自检从 B5 起就算得出来，但报表侧一直没接");
    assert.equal(typeof res.body?.selfCheck.difference, "number");
    assert.equal(typeof res.body?.selfCheck.residual, "number");
    assert.equal(typeof res.body?.selfCheck.balanced, "boolean");
    assert.ok(Array.isArray(res.body?.selfCheck.openFiscalYears));
  });

  await t.test("自检把差额与其成因分开报告，不凑平", async () => {
    const { getBalanceSheet } = await import("../reports/routes.js");
    const capture = createResponseCapture();
    await getBalanceSheet(
      {
        method: "GET",
        url: "/api/reports/balance-sheet?periodType=month&year=2026&month=7",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response
    );
    const check = capture.readJson().body?.selfCheck;

    // 恒等式：difference 必须等于可解释部分 + 残差，这是自检自身的不变式
    assert.equal(
      check.difference,
      check.unclosedProfitLoss - check.unclassified + check.residual,
      "差额必须能被拆成「未结转损益 − 未分类 + 残差」，拆不开说明自检自己算错了"
    );
  });
});
