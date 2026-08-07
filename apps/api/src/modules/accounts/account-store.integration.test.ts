/**
 * 科目自定义（V12-B1/B7）。
 *
 * 科目表落库的直接价值是「用户能自己维护」——制造业要在生产成本下挂料/工/费明细，
 * 服务业根本用不到，餐饮要「主营业务成本-食材/人工」。一份写死的 63 条服务不了
 * 多个客户，每个新客户都要改代码发版。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("a company can add a custom detail account under an unused parent", async () => {
  await prepareDatabase();
  const { createCompanyAccount, listCompanyAccounts } = await import("./account-store.js");
  const { checkAccountsUsable } = await import("./account-guard.js");
  const { closePool } = await import("../../db/client.js");
  try {
    // 6051 其他业务收入：模板里是叶子且没有分录
    const created = await createCompanyAccount({
      companyId: COMPANY_ID,
      code: "605101",
      name: "其他业务收入-废料",
      category: "revenue",
      accountType: "income",
      direction: "credit",
      parentCode: "6051"
    });
    assert.equal(created.ok, true);

    // 新科目立刻可用于记账
    assert.deepEqual(await checkAccountsUsable(COMPANY_ID, [{ accountCode: "605101" }]), { ok: true });

    // 父科目自动变成汇总科目，不能再直接记账 —— 否则它的余额会与子科目合计重复
    const parent = await checkAccountsUsable(COMPANY_ID, [{ accountCode: "6051" }]);
    assert.equal(parent.ok, false);
    assert.equal(parent.ok === false && parent.code, "ACCOUNT_NOT_LEAF");

    // 同样不写死数量：断言的是「比建之前多了一个」
    const all = await listCompanyAccounts(COMPANY_ID);
    assert.ok(
      all.some((a) => a.code === "605101"),
      "自建科目应出现在列表里"
    );
  } finally {
    await closePool();
  }
});

test("a parent that already has ledger entries cannot take sub-accounts", async () => {
  await prepareDatabase();
  const { createCompanyAccount } = await import("./account-store.js");
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 给 6001 造一条分录
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status)
       values ('vch-acct-1', $1, 'accrual', '科目测试', 'draft')`,
      [COMPANY_ID]
    );
    await pool.query(
      `insert into ledger_entries (id, company_id, voucher_id, entry_date, summary, account_code, account_name, debit, credit)
       values ('le-acct-1', $1, 'vch-acct-1', '2026-05-15'::date, '测试', '6001', '主营业务收入', 0, 100)`,
      [COMPANY_ID]
    );

    // 往有分录的科目下挂子级会让既有分录挂在汇总科目上，合计时被算两次
    // （迁移 042 修的正是这类问题）
    const result = await createCompanyAccount({
      companyId: COMPANY_ID,
      code: "600101",
      name: "主营业务收入-软件",
      category: "revenue",
      accountType: "income",
      direction: "credit",
      parentCode: "6001"
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, "PARENT_HAS_ENTRIES");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("accounts are deactivated rather than deleted, and stay readable afterwards", async () => {
  await prepareDatabase();
  const { setAccountActive, findCompanyAccount, listCompanyAccounts } = await import("./account-store.js");
  const { checkAccountsUsable } = await import("./account-guard.js");
  const { closePool } = await import("../../db/client.js");
  try {
    const off = await setAccountActive(COMPANY_ID, "6111", false);
    assert.equal(off.ok, true);

    // 停用后不能记账
    const guard = await checkAccountsUsable(COMPANY_ID, [{ accountCode: "6111" }]);
    assert.equal(guard.ok === false && guard.code, "ACCOUNT_INACTIVE");

    // 但记录还在 —— 历史分录引用它时仍然读得到科目名，账簿不会变成天书
    const still = await findCompanyAccount(COMPANY_ID, "6111");
    assert.equal(still?.name, "投资收益");

    // 默认列表不含停用科目；科目管理页要能看到才能重新启用
    assert.equal((await listCompanyAccounts(COMPANY_ID)).some((a) => a.code === "6111"), false);
    assert.equal(
      (await listCompanyAccounts(COMPANY_ID, { includeInactive: true })).some((a) => a.code === "6111"),
      true
    );

    // 可以重新启用
    assert.equal((await setAccountActive(COMPANY_ID, "6111", true)).ok, true);
    assert.deepEqual(await checkAccountsUsable(COMPANY_ID, [{ accountCode: "6111" }]), { ok: true });
  } finally {
    await closePool();
  }
});
