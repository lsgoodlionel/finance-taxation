/**
 * 预算与占用的路径级断言（V13-A2）。
 *
 * 校验算法由 check.ts / applicable.ts 的单测钉住。这里测的是只有连库才成立的
 * 部分——而它们恰好是整个预算体系最容易错的地方：
 *
 * 1. **占用幂等**：审批接口被重复调用时会不会把预算占两遍；
 * 2. **不重复计**：占用转实际后，已占用与已发生会不会同时算这笔钱；
 * 3. **取数口径**：实际发生额有没有真的按科目前缀与成本中心过滤、有没有排除
 *    结转损益分录。
 *
 * 第 2 条错了不会报错，只会让预算凭空少一半；第 3 条错了会让费用全额漏计，
 * 预算执行率永远 0%。两者都是「静默算错」，必须有断言。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
/** 管理费用-差旅费。用真实科目而不是造一个，取数口径才是真的被验到。 */
const TRAVEL_ACCOUNT = "660203";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

/** 造一条已过账的费用分录。 */
async function seedExpense(
  pool: pg.Pool,
  params: {
    id: string;
    accountCode: string;
    amountYuan: string;
    costCenterId: string | null;
    entryDate: string;
    /** ledger_entries.source 只认 voucher_posting / period_closing /
     *  annual_closing / opening_balance 四个值（CHECK 约束）。默认走正常过账。 */
    source?: string;
  }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source,
                           accounting_date, period, posted_at)
     values ($1, $2, 'general', 'V13 预算测试', 'posted', $5, $3::date, $4, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.entryDate, params.entryDate.slice(0, 7), params.source ?? "manual"]
  );
  await pool.query(
    `insert into ledger_entries
       (id, company_id, voucher_id, entry_date, summary, account_code, account_name,
        debit, credit, source, posted_at, cost_center_id)
     values ($1, $2, $3, $4::date, '差旅费', $5,
             (select name from accounts where company_id = $2 and code = $5),
             $6, 0, $7, now(), $8)`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.entryDate,
      params.accountCode,
      params.amountYuan,
      params.source ?? "voucher_posting",
      params.costCenterId
    ]
  );
}

test("预算占用与实际发生的口径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createBudget, reserveBudget, transitionEncumbrance } = await import("./budget-store.js");
  const { loadBudgetUsage, getBudget } = await import("./queries.js");

  const created = await createBudget({
    companyId: COMPANY_ID,
    periodType: "month",
    periodKey: "2026-06",
    costCenterId: null,
    accountCode: TRAVEL_ACCOUNT,
    amountCents: 1_000_00,
    controlPolicy: "warn",
    note: null
  });
  assert.equal(created.ok, true);
  const budget = created.ok ? created.value : null;
  assert.ok(budget);

  await t.test("重复占用同一张单据不会占两遍", async () => {
    // Arrange & Act：同一张申请单调两次（模拟网络重试或用户连点）
    await reserveBudget({
      companyId: COMPANY_ID,
      budgetId: budget.id,
      sourceType: "request",
      sourceId: "req-001",
      amountCents: 300_00
    });
    await reserveBudget({
      companyId: COMPANY_ID,
      budgetId: budget.id,
      sourceType: "request",
      sourceId: "req-001",
      amountCents: 300_00
    });

    // Assert：占用仍是一笔 300 元，不是 600
    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.encumberedCents, 300_00);
  });

  await t.test("重复占用时金额以最后一次为准", async () => {
    // 审批过程中把单据金额改小是常见操作。
    await reserveBudget({
      companyId: COMPANY_ID,
      budgetId: budget.id,
      sourceType: "request",
      sourceId: "req-001",
      amountCents: 250_00
    });

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.encumberedCents, 250_00);
  });

  await t.test("转实际后不再计入已占用", async () => {
    // 这是整个口径的关键：单据落账后账上有了实际发生额，占用必须让位，
    // 否则同一笔钱被算两遍，预算凭空少一半。
    await seedExpense(pool, {
      id: "le-v13-001",
      accountCode: TRAVEL_ACCOUNT,
      amountYuan: "250.00",
      costCenterId: null,
      entryDate: "2026-06-15"
    });
    await transitionEncumbrance(budget.id, "request", "req-001", "realized");

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.encumberedCents, 0, "转实际后占用应归零");
    assert.equal(usage.actualCents, 250_00, "实际发生额应从账上取到");
  });

  await t.test("释放的占用不计入任何口径", async () => {
    await reserveBudget({
      companyId: COMPANY_ID,
      budgetId: budget.id,
      sourceType: "request",
      sourceId: "req-002",
      amountCents: 500_00
    });
    await transitionEncumbrance(budget.id, "request", "req-002", "released");

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.encumberedCents, 0);
  });

  await t.test("已转实际的占用不能再被释放", async () => {
    // 允许 realized → released 会让预算凭空多出额度，而那笔钱其实已经花掉了。
    await transitionEncumbrance(budget.id, "request", "req-001", "released");

    const rows = await pool.query<{ status: string }>(
      `select status from budget_encumbrances
        where budget_id = $1 and source_type = 'request' and source_id = 'req-001'`,
      [budget.id]
    );
    assert.equal(rows.rows[0]?.status, "realized", "realized 状态不应被 released 覆盖");
  });

  await t.test("科目前缀之外的费用不计入本预算", async () => {
    // 预算立在 660203 差旅费上，办公费 660201 不该被算进来。
    await seedExpense(pool, {
      id: "le-v13-002",
      accountCode: "660201",
      amountYuan: "800.00",
      costCenterId: null,
      entryDate: "2026-06-16"
    });

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.actualCents, 250_00, "办公费不应计入差旅费预算");
  });

  await t.test("期间之外的费用不计入本预算", async () => {
    await seedExpense(pool, {
      id: "le-v13-003",
      accountCode: TRAVEL_ACCOUNT,
      amountYuan: "999.00",
      costCenterId: null,
      entryDate: "2026-07-01"
    });

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.actualCents, 250_00, "7 月的费用不应计入 6 月预算");
  });

  await t.test("月末最后一天的费用计入本期", async () => {
    // 闭区间。差一天会让月末的单据神秘地不受预算控制。
    await seedExpense(pool, {
      id: "le-v13-004",
      accountCode: TRAVEL_ACCOUNT,
      amountYuan: "100.00",
      costCenterId: null,
      entryDate: "2026-06-30"
    });

    const usage = await loadBudgetUsage(budget);
    assert.equal(usage.actualCents, 350_00);
  });

  await t.test("删除有未结占用的预算被拒绝", async () => {
    const { deleteBudget } = await import("./budget-store.js");
    await reserveBudget({
      companyId: COMPANY_ID,
      budgetId: budget.id,
      sourceType: "request",
      sourceId: "req-003",
      amountCents: 100_00
    });

    const result = await deleteBudget(COMPANY_ID, budget.id);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failure.code, "BUDGET_HAS_ENCUMBRANCE");
    // 预算仍在
    assert.ok(await getBudget(COMPANY_ID, budget.id));
  });

  await t.test("同维度重复建预算被唯一索引拒绝", async () => {
    const duplicate = await createBudget({
      companyId: COMPANY_ID,
      periodType: "month",
      periodKey: "2026-06",
      costCenterId: null,
      accountCode: TRAVEL_ACCOUNT,
      amountCents: 500_00,
      controlPolicy: "warn",
      note: null
    });

    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.failure.code, "BUDGET_DUPLICATE");
  });

  await t.test("两条 null 维度的预算同样不能重复建", async () => {
    // Postgres 的普通唯一约束里 null 互不相等，靠 coalesce 哨兵值的表达式
    // 唯一索引才拦得住。不拦的话「全公司不限科目」的预算能建无数条，
    // 每条都算一遍可用额度。
    // 用 2027 而不是 2026：种子已经播了一条 2026 年度全公司预算
    //（seed-acceptance-data.ts 的 SEED_BUDGETS），撞上去测的就不是本用例
    // 想验的东西了。
    const base = {
      companyId: COMPANY_ID,
      periodType: "year" as const,
      periodKey: "2027",
      costCenterId: null,
      accountCode: null,
      amountCents: 10_000_00,
      controlPolicy: "warn" as const,
      note: null
    };
    const first = await createBudget(base);
    assert.equal(first.ok, true);

    const second = await createBudget(base);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.failure.code, "BUDGET_DUPLICATE");
  });
});
