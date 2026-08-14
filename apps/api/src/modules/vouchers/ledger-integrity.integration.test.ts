/**
 * V12-A7 + A9：把两条一直靠「大家记得」维持的不变量下沉到数据库（迁移 047）。
 *
 * A7 —— ledger_entries / voucher_lines 此前没有任何 CHECK：负数金额、同一行既有借
 * 又有贷，数据库都照收。应用层的借贷校验只在 postVoucher 里，而 closePeriod 直接
 * insert 绕过了它。约束下沉后，任何路径（含将来新增的、含直连库的运维脚本）都写不进
 * 结构性非法的分录。
 *
 * A9 —— voucher_lines 没有 company_id，只能靠 voucher_id 间接归属，所以在数据库层
 * 完全没有租户边界。补列后由触发器从所属凭证派生，而不是要求 8 个插入点各自填。
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

/** 断言这条 SQL 被数据库拒绝，且拒绝原因是指定约束。 */
async function assertRejected(pool: pg.Pool, sql: string, params: unknown[], constraint: string) {
  await assert.rejects(
    () => pool.query(sql, params),
    (err: { constraint?: string; message: string }) => {
      assert.equal(err.constraint, constraint, `应违反 ${constraint}，实际：${err.message}`);
      return true;
    }
  );
}

test("the database itself refuses structurally invalid ledger entries", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status)
       values ('vch-chk-1', $1, 'accrual', '约束测试凭证', 'draft')`,
      [COMPANY_ID]
    );
    const base = `insert into ledger_entries
      (id, company_id, voucher_id, entry_date, summary, account_code, account_name, debit, credit)
      values ($1, $2, 'vch-chk-1', '2026-05-15'::date, '约束测试', '1002', '银行存款', $3::numeric, $4::numeric)`;

    // 负数金额：借贷方向由 debit/credit 两列表达，负数没有意义且会让所有下游聚合失真
    await assertRejected(pool, base, ["le-neg-debit", COMPANY_ID, "-100.00", "0.00"], "ledger_entries_nonneg_check");
    await assertRejected(pool, base, ["le-neg-credit", COMPANY_ID, "0.00", "-100.00"], "ledger_entries_nonneg_check");

    // 同一行既有借又有贷：复式记账里没有这种形状，允许它只会让每个聚合逻辑都要处理
    await assertRejected(pool, base, ["le-both", COMPANY_ID, "100.00", "100.00"], "ledger_entries_single_side_check");

    // 合法形状仍然写得进去 —— 约束不能误伤正常分录
    await pool.query(base, ["le-ok-debit", COMPANY_ID, "100.00", "0.00"]);
    await pool.query(base, ["le-ok-credit", COMPANY_ID, "0.00", "100.00"]);
    await pool.query(base, ["le-ok-zero", COMPANY_ID, "0.00", "0.00"]);
    const ok = await pool.query<{ count: string }>(
      `select count(*)::text as count from ledger_entries where id like 'le-ok-%'`
    );
    assert.equal(ok.rows[0]?.count, "3");
  } finally {
    await pool.end();
  }
});

test("voucher_lines inherits company_id from its voucher without the caller supplying it", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status)
       values ('vch-trg-1', $1, 'accrual', '触发器测试', 'draft')`,
      [COMPANY_ID]
    );

    // 不传 company_id —— 这正是全仓 8 个插入点的写法
    await pool.query(
      `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values ('vl-trg-1', 'vch-trg-1', '分录', '1002', '银行存款', 100, 0, 1)`
    );
    const row = await pool.query<{ company_id: string }>(
      `select company_id from voucher_lines where id = 'vl-trg-1'`
    );
    assert.equal(row.rows[0]?.company_id, COMPANY_ID, "触发器应从所属凭证补齐租户");

    // 显式传值仍被尊重（不覆盖调用方的意图）
    await pool.query(
      `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order, company_id)
       values ('vl-trg-2', 'vch-trg-1', '分录', '6001', '主营业务收入', 0, 100, 2, $1)`,
      [COMPANY_ID]
    );
    const explicit = await pool.query<{ company_id: string }>(
      `select company_id from voucher_lines where id = 'vl-trg-2'`
    );
    assert.equal(explicit.rows[0]?.company_id, COMPANY_ID);

    // 凭证分录同样受借贷形状约束
    await assertRejected(
      pool,
      `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values ('vl-trg-bad', 'vch-trg-1', '分录', '1002', '银行存款', 50, 50, 3)`,
      [],
      "voucher_lines_single_side_check"
    );
  } finally {
    await pool.end();
  }
});

/**
 * 凭证状态的取值约束（迁移 072，蓝图第六节第 1 条的落地）。
 *
 * 与 `ledger_entries.source` 的 CHECK（迁移 067）是同一件事的另一半，当时只做了
 * 分录侧。蓝图记的待核实项是「排序表达式里有 'validated' / 'approved'，但
 * VoucherStatus 只有三个值，跑 select distinct 确认」——查下来种子库里确实没有
 * 脏数据，但这一列**当时没有任何约束**，所以「没有」纯属运气而不是保证。
 */
test("数据库拒绝 VoucherStatus 之外的凭证状态", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 三个合法状态都能写
    for (const [index, status] of ["draft", "review_required", "posted"].entries()) {
      await pool.query(
        `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period)
         values ($1, $2, 'general', '状态约束验证', $3, 'test', '2026-06-30'::date, '2026-06')`,
        [`vch-status-ok-${index}`, COMPANY_ID, status]
      );
    }

    // 排序表达式里遗留的两个早期状态现在写不进去了 —— 它们的存在正说明
    // 这一列历史上被写过别的取值
    for (const status of ["validated", "approved"]) {
      await assertRejected(
        pool,
        `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period)
         values ($1, $2, 'general', '早期状态机遗留', $3, 'test', '2026-06-30'::date, '2026-06')`,
        [`vch-status-bad-${status}`, COMPANY_ID, status],
        "vouchers_status_check"
      );
    }

    // 空串与拼写错误同样挡住：状态判定全是字符串比较，写错一个字母会让这张凭证
    // 从「未过账清单」和「已过账账簿」里同时消失
    await assertRejected(
      pool,
      `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period)
       values ('vch-status-typo', $1, 'general', '拼写错误', 'postd', 'test', '2026-06-30'::date, '2026-06')`,
      [COMPANY_ID],
      "vouchers_status_check"
    );
  } finally {
    await pool.end();
  }
});
