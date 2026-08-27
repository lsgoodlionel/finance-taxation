/**
 * 付款确认必须幂等（V16 角色实验发现）。
 *
 * ## 缺陷
 *
 * `confirmPayment` 的幂等判断（`if (payment.voucherId) return ...`）在**事务外面**。
 * 六个并发请求会同时读到 `voucherId` 为空、同时通过检查，各自生成一张付款凭证。
 *
 * 出纳在实验里实测：同一付款单并发 6 次 confirm → **6 个不同的 voucherId**；
 * 同一借款单并发 6 次 pay → 同样 6 张。而代码注释自称幂等。
 *
 * 网络重试在支付链路上是常态。用户点一下按钮、页面卡住、再点一下——
 * 就是两个并发请求。六张凭证一旦都被过账，这笔款在账上就是六倍。
 *
 * ## 这条为什么必须并发跑
 *
 * 顺序调用两次是测不出来的：第二次调用时第一次已经写好了 `voucher_id`，
 * 事务外那个快路径就会命中。**缺陷只在两个请求重叠的那个窗口里存在。**
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const REIMBURSEMENT_ID = "rmb-idem-fixture";
const PAYMENT_ID = "pay-idem-fixture";

test("同一付款单并发确认多次，只生成一张凭证", async (t) => {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  // 一张已批准的报销单 + 一张待确认的付款单。
  // 报销单的往来单位（报销人对应的员工往来）由 ensureEmployeeCounterparty 建，
  // 这里直接复用它，避免夹具自己造一个和业务口径不一致的往来单位。
  const { ensureEmployeeCounterparty } = await import("../advances/store.js");
  const counterpartyId = await ensureEmployeeCounterparty(COMPANY_ID, "usr-v4-employee");

  await pool.query(
    `insert into reimbursements (
       id, company_id, reimbursement_no, applicant_user_id, counterparty_id,
       expense_date, status, note, created_at, updated_at
     ) values ($1,$2,'RMB-IDEM-001','usr-v4-employee',$3,'2026-08-10'::date,
               'approved','[夹具] 幂等测试', now(), now())`,
    [REIMBURSEMENT_ID, COMPANY_ID, counterpartyId]
  );
  await pool.query(
    `insert into reimbursement_lines (
       id, company_id, reimbursement_id, expense_type, account_code, amount_cents, summary, sort_order
     ) values ($1,$2,$3,'travel','660203',120000,'高铁票',0)`,
    [`${REIMBURSEMENT_ID}-l1`, COMPANY_ID, REIMBURSEMENT_ID]
  );
  await pool.query(
    `insert into payments (
       id, company_id, payment_no, reimbursement_id, amount_cents, paid_on, status,
       created_by_user_id, created_at, updated_at
     ) values ($1,$2,'PAY-IDEM-001',$3,120000,'2026-08-11'::date,'draft','usr-v4-cashier', now(), now())`,
    [PAYMENT_ID, COMPANY_ID, REIMBURSEMENT_ID]
  );

  // ── 并发确认 6 次 ───────────────────────────────────────────────────────
  const { confirmPayment } = await import("./store.js");
  const results = await Promise.all(
    Array.from({ length: 6 }, () => confirmPayment(COMPANY_ID, PAYMENT_ID))
  );

  const okResults = results.filter((r) => r.ok);
  assert.equal(okResults.length, 6, "六次调用都应当成功——重试不该报错");

  const voucherIds = new Set(
    okResults.map((r) => (r.ok ? r.value.voucherId : "")).filter(Boolean)
  );
  assert.equal(
    voucherIds.size,
    1,
    `六次并发确认必须返回同一个凭证号，实际返回了 ${voucherIds.size} 个：` +
      `${[...voucherIds].join(", ")}——每一个都是一笔真金白银的付款分录`
  );

  // ── 库里也只能有一张 ────────────────────────────────────────────────────
  const vouchers = await pool.query<{ n: string }>(
    `select count(*)::text n from vouchers where id like 'vch-pay-%' and company_id = $1`,
    [COMPANY_ID]
  );
  assert.equal(vouchers.rows[0]!.n, "1", "库里只能有一张付款凭证");

  const payment = await pool.query<{ status: string; voucher_id: string }>(
    `select status, voucher_id from payments where id = $1`,
    [PAYMENT_ID]
  );
  assert.equal(payment.rows[0]!.status, "paid");
  assert.equal(
    payment.rows[0]!.voucher_id,
    [...voucherIds][0],
    "付款单上记的凭证号要和返回的一致"
  );

  // ── 事后再确认一次（顺序调用）：仍然是同一张 ────────────────────────────
  const again = await confirmPayment(COMPANY_ID, PAYMENT_ID);
  assert.ok(again.ok);
  assert.equal(
    again.ok ? again.value.voucherId : "",
    [...voucherIds][0],
    "已确认过的付款单再确认，返回原凭证号"
  );
});
