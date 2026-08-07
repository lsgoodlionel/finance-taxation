/**
 * 科目写入闸门（V12-B1 / 蓝图 E2）。
 *
 * 此前 findChartAccount() 全仓 6 处调用，5 处在测试文件、1 处在读路径，
 * **三个写入函数一次都没调**；voucher_lines.account_code 与
 * ledger_entries.account_code 是裸 text，无外键无 CHECK。任何客户端调
 * POST /api/vouchers 都能写进任意字符串并过账。
 *
 * 这个洞已造成两次线上错账，有迁移留档：
 * - 041 —— 编码体系错配导致 788,679 元收入与实收资本在报表中静默消失、资产负债表不平
 * - 042 —— 分录挂到非叶子科目 2211 导致前缀汇总重复计量
 *
 * 两次都是事后 SQL UPDATE 补救。这些断言让同类问题在写入端就被挡住。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const OTHER_COMPANY_ID = "cmp-v4-service";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("every company gets its own chart of accounts, seeded automatically", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const counts = await pool.query<{ company_id: string; count: string }>(
      `select company_id, count(*)::text as count from accounts group by company_id order by company_id`
    );
    assert.ok(counts.rows.length >= 2, "至少两家公司应各有一套科目");
    for (const row of counts.rows) {
      assert.equal(row.count, "63", `${row.company_id} 应有 63 个科目`);
    }

    // 建公司时自动铺科目 —— 靠触发器而不是靠建公司的代码路径记得调用。
    // 一个没有科目的公司连第一张凭证都记不了。
    await pool.query(
      `insert into companies (id, name) values ('cmp-guard-new', '新建公司测试')`
    );
    const fresh = await pool.query<{ count: string }>(
      `select count(*)::text as count from accounts where company_id = 'cmp-guard-new'`
    );
    assert.equal(fresh.rows[0]?.count, "63", "新建公司应自动获得整套科目");
  } finally {
    await pool.end();
  }
});

test("the guard refuses unknown, non-leaf, and inactive accounts", async () => {
  await prepareDatabase();
  const { checkAccountsUsable } = await import("./account-guard.js");
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 合法：叶子且启用
    assert.deepEqual(
      await checkAccountsUsable(COMPANY_ID, [{ accountCode: "1002" }, { accountCode: "6001" }]),
      { ok: true }
    );

    // 不存在的科目 —— 041 事故的根因就是这类编码写进了库
    const unknown = await checkAccountsUsable(COMPANY_ID, [{ accountCode: "9999" }]);
    assert.equal(unknown.ok, false);
    assert.equal(unknown.ok === false && unknown.code, "ACCOUNT_NOT_FOUND");

    // 非叶子（汇总科目）—— 042 事故的根因：往 2211 直接记账导致合计时被算两次
    for (const code of ["2211", "2221", "6301e", "6401"]) {
      const nonLeaf = await checkAccountsUsable(COMPANY_ID, [{ accountCode: code }]);
      assert.equal(nonLeaf.ok, false, `${code} 是汇总科目，不该允许直接记账`);
      assert.equal(nonLeaf.ok === false && nonLeaf.code, "ACCOUNT_NOT_LEAF");
    }

    // 停用的科目
    await pool.query(`update accounts set is_active = false where company_id = $1 and code = '6051'`, [
      COMPANY_ID
    ]);
    const inactive = await checkAccountsUsable(COMPANY_ID, [{ accountCode: "6051" }]);
    assert.equal(inactive.ok, false);
    assert.equal(inactive.ok === false && inactive.code, "ACCOUNT_INACTIVE");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("accounts are company-scoped: another tenant's custom account is not usable here", async () => {
  await prepareDatabase();
  const { checkAccountsUsable } = await import("./account-guard.js");
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 另一家公司自建一个明细科目
    await pool.query(
      `insert into accounts (id, company_id, code, name, category, account_type, direction, path, is_leaf, source)
       values ($1, $2, '600101', '主营业务收入-软件', 'revenue', 'income', 'credit', '6001.600101'::ltree, true, 'custom')`,
      [`${OTHER_COMPANY_ID}:600101`, OTHER_COMPANY_ID]
    );

    // 它自己能用
    assert.deepEqual(
      await checkAccountsUsable(OTHER_COMPANY_ID, [{ accountCode: "600101" }]),
      { ok: true }
    );
    // 本公司不能用 —— 科目自定义必须是按公司隔离的，否则多租户就漏了
    const crossTenant = await checkAccountsUsable(COMPANY_ID, [{ accountCode: "600101" }]);
    assert.equal(crossTenant.ok, false);
    assert.equal(crossTenant.ok === false && crossTenant.code, "ACCOUNT_NOT_FOUND");
  } finally {
    await closePool();
    await pool.end();
  }
});
