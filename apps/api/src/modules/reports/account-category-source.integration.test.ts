/**
 * 报表分类的事实来源必须是 `accounts` 表，不是硬编码的 chart-of-accounts.ts
 * （V12 残留 7）。
 *
 * ## 这条测试为什么这么写
 *
 * 049 把科目表落了库，但报表侧一直读 TS 常量。`chart-parity.integration.test.ts`
 * 能拦住两份数据漂移，却证明不了报表**实际读的是哪一份** —— 两份一致时，读哪份
 * 都得到同样的报表。
 *
 * 所以这里故意把两份弄不一致：改库里某个科目的 `category`，再看报表跟不跟着变。
 * 跟着变说明读的是库；不变说明读的还是常量。这是唯一能分辨的办法。
 *
 * **改完记得改回去**：这个库是车道共享的，留一个 category 被改坏的科目，后面
 * 所有报表用例都会莫名其妙。
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

async function seedEntry(
  pool: pg.Pool,
  params: { id: string; accountCode: string; accountName: string; debit: string; credit: string }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', '事实来源验证', 'posted', 'test', '2026-06-30'::date, '2026-06', now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID]
  );
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, entry_date, summary, account_code, account_name,
       debit, credit, source, posted_at
     ) values ($1, $2, $3, '2026-06-30'::date, '事实来源验证', $4, $5, $6::numeric, $7::numeric,
               'voucher_posting', now())`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.accountCode,
      params.accountName,
      params.debit,
      params.credit
    ]
  );
}

async function getProfitStatement() {
  const { getProfitStatement: route } = await import("./routes.js");
  const capture = createResponseCapture();
  await route(
    {
      method: "GET",
      url: "/api/reports/profit-statement?periodType=month&year=2026&month=6",
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("报表分类跟着 accounts 表走，而不是硬编码的科目常量", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    // 一定要还原：车道库是共享的，留一个 category 被改坏的科目会让后面所有
    // 报表用例莫名其妙，而且排查时根本想不到是这条测试干的。
    await pool.query(
      `update accounts set category = 'revenue' where company_id = $1 and code = '6001'`,
      [COMPANY_ID]
    );
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  // 6001 主营业务收入，贷方 10 万
  await seedEntry(pool, {
    id: "le-src-1",
    accountCode: "6001",
    accountName: "主营业务收入",
    debit: "0.00",
    credit: "100000.00"
  });

  await t.test("基线：按库里的 revenue 归类，计入收入", async () => {
    const report = await getProfitStatement();
    assert.equal(report.statusCode, 200, JSON.stringify(report.body));
    assert.equal(report.body?.totals?.revenue, "100000");
    assert.equal(report.body?.totals?.expenses, "0");
  });

  await t.test("把库里的 category 改成 expense，报表必须跟着改口径", async () => {
    // 这是一个**故意制造的错误分类** —— 现实里没人会把主营业务收入标成费用。
    // 它唯一的作用是让库与 chart-of-accounts.ts 不一致，从而分辨报表读的是哪一份。
    await pool.query(
      `update accounts set category = 'expense' where company_id = $1 and code = '6001'`,
      [COMPANY_ID]
    );

    const report = await getProfitStatement();
    assert.equal(
      report.body?.totals?.revenue,
      "0",
      "报表仍把 6001 算成收入 —— 说明读的是硬编码常量，库改了它不知道"
    );
    // 贷方 10 万在费用口径下是 -10 万（费用取 debit - credit）
    assert.equal(report.body?.totals?.expenses, "-100000", "改成 expense 后应落到费用侧");
  });

  await t.test("改回 revenue，报表恢复原状", async () => {
    await pool.query(
      `update accounts set category = 'revenue' where company_id = $1 and code = '6001'`,
      [COMPANY_ID]
    );
    const report = await getProfitStatement();
    assert.equal(report.body?.totals?.revenue, "100000");
  });
});
