/**
 * 付款单「提交待发」——银企直连与 CSV 导出的必经一步（V16）。
 *
 * ## 缺陷
 *
 * `payments.status = 'submitted'` **全库没有任何路径能产生**：
 * 它只被检查、从没被写入。全仓唯一写状态的地方是确认付款写 `paid`。
 *
 * 于是出纳的两条本职路径都是死的：
 *
 *   - **银企直连发款**：`POST /api/bank-connect/instructions` 只接受 submitted，
 *     恒返回 409 `BANK_PAYMENT_NOT_SUBMITTED`
 *   - **导出银行 CSV**：页面上 `disabled: row.status !== "submitted"`，
 *     那个复选框**永远勾不中任何一行**，导出按钮恒为灰
 *
 * 出纳在角色实验里把这两条都报成了阻断——「后端能做但前台点不到」的
 * 又一个变种：这次连后端也走不通，因为前置状态压根到不了。
 *
 * ## 门槛没错，缺的是动作
 *
 * 「草稿不能发给银行」是对的——草稿的意思就是「还没定」。
 * 补的是 draft → submitted 这一步，而不是把门槛拆掉。
 *
 * ## 不强制所有付款都走它
 *
 * 手工付款（现金、柜台转账）仍然可以 `draft → paid` 直接确认。
 * 强制会破坏那条正当的流程。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

/**
 * 造一张付款单。
 *
 * 付款单必须恰好挂在一个对象上（`payment_exactly_one_target` 约束）——
 * 合同期次或报销单。这条约束是对的：一笔付款总得说清是在付什么。
 * 这里挂报销单。
 */
async function seedPayment(pool: pg.Pool, id: string, reimbursementId: string) {
  const { ensureEmployeeCounterparty } = await import("../advances/store.js");
  const counterpartyId = await ensureEmployeeCounterparty(COMPANY_ID, "usr-v4-employee");
  await pool.query(
    `insert into reimbursements (
       id, company_id, reimbursement_no, applicant_user_id, counterparty_id,
       expense_date, status, created_at, updated_at
     ) values ($1,$2,$3,'usr-v4-employee',$4,'2026-08-10'::date,'approved', now(), now())`,
    [reimbursementId, COMPANY_ID, `RMB-${reimbursementId.slice(-6)}`, counterpartyId]
  );
  await pool.query(
    `insert into reimbursement_lines (
       id, company_id, reimbursement_id, expense_type, account_code, amount_cents, summary, sort_order
     ) values ($1,$2,$3,'travel','660203',120000,'高铁票',0)`,
    [`${reimbursementId}-l1`, COMPANY_ID, reimbursementId]
  );
  await pool.query(
    `insert into payments (
       id, company_id, payment_no, reimbursement_id, amount_cents, paid_on, status,
       created_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,120000,'2026-08-11'::date,'draft','usr-v4-cashier', now(), now())`,
    [id, COMPANY_ID, `PAY-${id.slice(-6)}`, reimbursementId]
  );
}

test("付款单能从草稿提交待发，之后才轮到银企直连与 CSV 导出", async (t) => {
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

  const { submitPaymentForBank, confirmPayment } = await import("./store.js");

  // ── 草稿 → 已提交 ───────────────────────────────────────────────────────
  await seedPayment(pool, "pay-submit-001", "rmb-submit-001");
  const submitted = await submitPaymentForBank(COMPANY_ID, "pay-submit-001");
  assert.ok(submitted.ok, "草稿应当能提交待发");
  assert.equal(submitted.ok && submitted.value.status, "submitted");

  const stored = await pool.query<{ status: string }>(
    `select status from payments where id = $1`,
    ["pay-submit-001"]
  );
  assert.equal(stored.rows[0]!.status, "submitted", "状态要真的落库");

  // ── 幂等：重复提交不报错 ────────────────────────────────────────────────
  //
  // 出纳点两下、或者网络重试，不该看到一个错误。
  const again = await submitPaymentForBank(COMPANY_ID, "pay-submit-001");
  assert.ok(again.ok, "重复提交应当幂等");
  assert.equal(again.ok && again.value.status, "submitted");

  // ── 银企直连此前恒 409，现在过得去前置检查 ──────────────────────────────
  //
  // 这条断言的意义在于：状态门槛不再是死路。
  // 真正发往银行还要有收款方信息与银行配置，那些各有各的校验。
  const { submitInstruction } = await import("../bank-connect/store.js");
  const instruction = await submitInstruction({
    companyId: COMPANY_ID,
    paymentId: "pay-submit-001",
    // 配置不存在，所以这次调用一定失败——但**失败的原因**才是重点。
    configId: "bcc-not-configured",
    userId: "usr-v4-cashier"
  });
  assert.equal(instruction.ok, false, "没配银企直连自然发不出去");
  assert.notEqual(
    !instruction.ok && instruction.failure.code,
    "BANK_PAYMENT_NOT_SUBMITTED",
    "提交待发之后，不该再因为**付款单状态**被挡——那是此前恒定失败的原因。" +
      "现在挡住它的应当是「没配银企直连」这类真实原因"
  );

  // ── 已提交的付款单仍然能确认付款 ────────────────────────────────────────
  const confirmed = await confirmPayment(COMPANY_ID, "pay-submit-001");
  assert.ok(confirmed.ok, "已提交的付款单要能走到 paid");

  // ── 手工付款不必经过这一步 ──────────────────────────────────────────────
  //
  // 现金、柜台转账是正当流程，强制走「提交待发」会破坏它。
  await seedPayment(pool, "pay-manual-001", "rmb-manual-001");
  const manual = await confirmPayment(COMPANY_ID, "pay-manual-001");
  assert.ok(manual.ok, "草稿应当能直接确认付款——手工付款不该被强制走提交待发");

  // ── 已付款的不能再提交待发 ──────────────────────────────────────────────
  const afterPaid = await submitPaymentForBank(COMPANY_ID, "pay-manual-001");
  assert.equal(afterPaid.ok, false, "已付款的单据不该能退回待发状态");
  assert.equal(
    !afterPaid.ok && afterPaid.failure.code,
    "PAYMENT_INVALID_TRANSITION"
  );
});
