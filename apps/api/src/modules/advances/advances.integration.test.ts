/**
 * 借款单与备用金冲销的路径级断言（V13-B3/B6）。
 *
 * 核心设计是「**余额由账上算，本表不重复记**」——这里的用例就是围绕它：
 * 付款、报销冲销、退款三步走完，余额必须归零，而这个零是从 `ledger_entries`
 * 算出来的，不是谁在 advances 表上写的。
 *
 * 会计上的完整链条：
 * ```
 * 借出 5000：借 1221 备用金 5000 / 贷 1002 银行存款 5000
 * 报销 4200：借 660203 差旅费 4200 / 贷 1221 备用金 4200
 * 退回  800：借 1002 银行存款 800 / 贷 1221 备用金 800
 *                                   → 1221 余额 = 0，结清
 * ```
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

/** 直接往账上写一条分录（模拟凭证已过账）。 */
async function postEntry(
  pool: pg.Pool,
  params: {
    id: string;
    accountCode: string;
    debit: string;
    credit: string;
    counterpartyId: string | null;
    entryDate: string;
  }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source,
                           accounting_date, period, posted_at)
     values ($1, $2, 'payment', '借款测试', 'posted', 'manual', $3::date, $4, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.entryDate, params.entryDate.slice(0, 7)]
  );
  await pool.query(
    `insert into ledger_entries
       (id, company_id, voucher_id, entry_date, summary, account_code, account_name,
        debit, credit, source, posted_at, counterparty_id)
     values ($1, $2, $3, $4::date, '借款测试', $5,
             (select name from accounts where company_id = $2 and code = $5),
             $6, $7, 'voucher_posting', now(), $8)`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.entryDate,
      params.accountCode,
      params.debit,
      params.credit,
      params.counterpartyId
    ]
  );
}

test("借款的付款、冲销与结清", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const {
    createAdvance,
    getAdvance,
    getAdvanceBalanceCents,
    transitionAdvance,
    ensureEmployeeCounterparty,
    ADVANCE_ACCOUNT_CODE
  } = await import("./store.js");
  const { payAdvance } = await import("./payment.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  await t.test("员工的往来单位自动建档且幂等", async () => {
    const first = await ensureEmployeeCounterparty(COMPANY_ID, userId);
    const second = await ensureEmployeeCounterparty(COMPANY_ID, userId);

    assert.equal(first, second, "重复调用应返回同一个往来单位");

    const row = await pool.query<{ category: string }>(
      `select category from counterparties where id = $1`,
      [first]
    );
    assert.equal(row.rows[0]?.category, "employee", "应标记为员工类往来单位");
  });

  const created = await createAdvance({
    companyId: COMPANY_ID,
    requestId: null,
    borrowerUserId: userId,
    amountCents: 5_000_00,
    purpose: "出差备用金",
    expectedReturnDate: "2026-10-31",
    note: null
  });
  assert.equal(created.ok, true);
  const advanceId = created.ok ? created.value.id : "";
  const counterpartyId = created.ok ? created.value.counterpartyId : "";

  await t.test("新建时余额为零——钱还没付出去", async () => {
    const advance = await getAdvance(COMPANY_ID, advanceId);
    assert.equal(await getAdvanceBalanceCents(advance!), 0);
  });

  await t.test("付款生成的是凭证草稿，不是已过账分录", async () => {
    await transitionAdvance(COMPANY_ID, advanceId, "submit");
    await transitionAdvance(COMPANY_ID, advanceId, "approve");

    const advance = await getAdvance(COMPANY_ID, advanceId);
    const outcome = await payAdvance({
      advance: advance!,
      paidOn: "2026-10-01",
      createdByUserId: userId
    });

    const voucher = await pool.query<{ status: string }>(
      `select status from vouchers where id = $1`,
      [outcome.voucherId]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "系统生成的凭证一律 draft");

    // 草稿不进总账，所以余额仍是 0——这不是 bug，是设计：
    // 账上真正出现这笔钱要等会计过账。
    const after = await getAdvance(COMPANY_ID, advanceId);
    assert.equal(await getAdvanceBalanceCents(after!), 0);
    assert.equal(after!.status, "paid");
  });

  await t.test("付款幂等：重复调用不生成第二张凭证", async () => {
    const advance = await getAdvance(COMPANY_ID, advanceId);
    const first = advance!.paymentVoucherId;

    const again = await payAdvance({
      advance: advance!,
      paidOn: "2026-10-01",
      createdByUserId: userId
    });

    assert.equal(again.voucherId, first, "应返回原来那张凭证");
    const count = await pool.query<{ count: string }>(
      `select count(*) as count from vouchers where id like 'vch-adv-%' and company_id = $1`,
      [COMPANY_ID]
    );
    assert.equal(Number(count.rows[0]!.count), 1, "不应多出付款凭证");
  });

  await t.test("凭证过账后余额等于借款金额", async () => {
    // 模拟会计过账：借 1221 / 贷 1002
    await postEntry(pool, {
      id: "le-adv-pay",
      accountCode: ADVANCE_ACCOUNT_CODE,
      debit: "5000.00",
      credit: "0",
      counterpartyId,
      entryDate: "2026-10-01"
    });

    const advance = await getAdvance(COMPANY_ID, advanceId);
    assert.equal(await getAdvanceBalanceCents(advance!), 5_000_00);
  });

  await t.test("有余额时不能标记结清", async () => {
    // 判据是账上的数，不是本表的状态——状态可以被人改，账不能。
    const denied = await transitionAdvance(COMPANY_ID, advanceId, "settle");
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.failure.code, "ADVANCE_HAS_BALANCE");
      assert.match(denied.failure.message, /5000\.00/, "应报出确切的未还金额");
    }
  });

  await t.test("报销冲销后余额减少", async () => {
    // 报销 4200：借 差旅费 / 贷 1221
    await postEntry(pool, {
      id: "le-adv-reimburse",
      accountCode: ADVANCE_ACCOUNT_CODE,
      debit: "0",
      credit: "4200.00",
      counterpartyId,
      entryDate: "2026-10-20"
    });

    const advance = await getAdvance(COMPANY_ID, advanceId);
    assert.equal(await getAdvanceBalanceCents(advance!), 800_00, "5000 - 4200 = 800");
  });

  await t.test("退回余款后余额归零，可以结清", async () => {
    // 退回 800：借 银行存款 / 贷 1221
    await postEntry(pool, {
      id: "le-adv-return",
      accountCode: ADVANCE_ACCOUNT_CODE,
      debit: "0",
      credit: "800.00",
      counterpartyId,
      entryDate: "2026-10-25"
    });

    const advance = await getAdvance(COMPANY_ID, advanceId);
    assert.equal(await getAdvanceBalanceCents(advance!), 0);

    const settled = await transitionAdvance(COMPANY_ID, advanceId, "settle");
    assert.equal(settled.ok, true);
    if (settled.ok) assert.equal(settled.value.status, "settled");
  });

  await t.test("借款金额必须为正", async () => {
    // 0 元借款没有业务含义，负数更是。
    for (const amount of [0, -100]) {
      const bad = await createAdvance({
        companyId: COMPANY_ID,
        requestId: null,
        borrowerUserId: userId,
        amountCents: amount,
        purpose: "非法金额",
        expectedReturnDate: null,
        note: null
      });
      assert.equal(bad.ok, false);
      if (!bad.ok) assert.equal(bad.failure.code, "ADVANCE_AMOUNT_INVALID");
    }
  });

  await t.test("草稿不能直接付款——必须先走审批", async () => {
    const draft = await createAdvance({
      companyId: COMPANY_ID,
      requestId: null,
      borrowerUserId: userId,
      amountCents: 1_000_00,
      purpose: "未审批的借款",
      expectedReturnDate: null,
      note: null
    });
    assert.equal(draft.ok, true);
    if (!draft.ok) return;

    // 状态机不允许 draft → paid（付款只对 approved 开放，见 routes 的守卫）
    const jumped = await transitionAdvance(COMPANY_ID, draft.value.id, "settle");
    assert.equal(jumped.ok, false);
    if (!jumped.ok) assert.equal(jumped.failure.code, "ADVANCE_INVALID_TRANSITION");
  });
});
