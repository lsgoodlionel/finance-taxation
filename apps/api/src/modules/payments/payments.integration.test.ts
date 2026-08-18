/**
 * 合同付款计划与付款单的路径级断言（V13-C）。
 *
 * 纯函数（状态推导、凭证方向、CSV 转义）已由单测钉住。这里测只有连库才
 * 成立的：累计已付真的是汇总出来的、超付真的拦得住、已付清的期次真的不再
 * 出现在应付列表里。
 *
 * 最后一条尤其重要——已付清的期次出现在「本月应付」里，出纳会重复付款。
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

test("合同付款计划、质保金与付款", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createSchedule, listSchedules, listDuePayments, cancelSchedule } =
    await import("../contracts/schedule-store.js");
  const { createPayment, confirmPayment, markExported } = await import("./store.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  // 合同自己建——种子里 cmp-v4-tech 没有合同（写这条测试时实测确认）。
  // 「取不到就跳过」的写法会让整组用例静默通过，B4 已经栽过一次。
  const contractId = "ct-test-v13c";
  await pool.query(
    `insert into contracts (id, company_id, contract_no, contract_type, title,
                            counterparty_name, amount, signed_date, status, created_by_user_id, created_by_name)
     values ($1, $2, 'HT-2026-001', 'purchase', '设备采购合同', '某某供应商',
             100000, '2026-09-01'::date, 'active', $3, '测试')
     on conflict (id) do nothing`,
    [contractId, COMPANY_ID, userId]
  );

  // 三期：首付 60%、尾款 30%、质保金 10%
  const first = await createSchedule({
    companyId: COMPANY_ID,
    contractId,
    periodNo: 1,
    title: "首付款",
    dueDate: "2026-09-30",
    amountCents: 600000,
    ratioBp: 6000,
    scheduleType: "normal",
    retentionReleaseDate: null,
    note: null
  });
  assert.equal(first.ok, true);
  const firstId = first.ok ? first.value.id : "";

  await createSchedule({
    companyId: COMPANY_ID,
    contractId,
    periodNo: 2,
    title: "尾款",
    dueDate: "2026-10-31",
    amountCents: 300000,
    ratioBp: 3000,
    scheduleType: "normal",
    retentionReleaseDate: null,
    note: null
  });

  const retention = await createSchedule({
    companyId: COMPANY_ID,
    contractId,
    periodNo: 3,
    title: "质保金",
    dueDate: "2026-10-31",
    amountCents: 100000,
    ratioBp: 1000,
    scheduleType: "retention",
    retentionReleaseDate: "2027-10-31",
    note: null
  });
  assert.equal(retention.ok, true);

  await t.test("期次重复被拒", async () => {
    const duplicate = await createSchedule({
      companyId: COMPANY_ID,
      contractId,
      periodNo: 1,
      title: "又一个首付款",
      dueDate: "2026-09-30",
      amountCents: 100,
      ratioBp: null,
      scheduleType: "normal",
      retentionReleaseDate: null,
      note: null
    });

    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.failure.code, "SCHEDULE_PERIOD_DUPLICATE");
  });

  await t.test("普通期次不能设质保金释放日", async () => {
    const bad = await createSchedule({
      companyId: COMPANY_ID,
      contractId,
      periodNo: 4,
      title: "普通期",
      dueDate: "2026-11-30",
      amountCents: 100,
      ratioBp: null,
      scheduleType: "normal",
      retentionReleaseDate: "2027-01-01",
      note: null
    });

    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.failure.code, "SCHEDULE_RETENTION_DATE_INVALID");
  });

  await t.test("初始进度：全未付，待付不含质保金", async () => {
    const { progress } = await listSchedules(COMPANY_ID, contractId);

    assert.equal(progress.totalCents, 1000000);
    assert.equal(progress.paidCents, 0);
    assert.equal(progress.unpaidCents, 900000, "待付应为首付+尾款，不含质保金");
    assert.equal(progress.retentionCents, 100000);
    assert.equal(progress.isFullyPaid, false);
  });

  await t.test("超付被拦住", async () => {
    // 首付 6000 元，试着付 7000。超付通常是含税不含税弄错，
    // 在钱付出去之前拦比事后红冲便宜得多。
    const over = await createPayment({
      companyId: COMPANY_ID,
      reimbursementId: null,
      scheduleId: firstId,
      amountCents: 700000,
      paidOn: "2026-09-30",
      bankAccountCode: "1002",
      createdByUserId: userId,
      note: null
    });

    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.equal(over.failure.code, "PAYMENT_EXCEEDS_REMAINING");
      assert.match(over.failure.message, /6000\.00/, "应报出确切的未付余额");
    }
  });

  let paymentId = "";
  await t.test("分批付款：累计已付由汇总算出来", async () => {
    const part1 = await createPayment({
      companyId: COMPANY_ID,
      reimbursementId: null,
      scheduleId: firstId,
      amountCents: 400000,
      paidOn: "2026-09-20",
      bankAccountCode: "1002",
      createdByUserId: userId,
      note: null
    });
    assert.equal(part1.ok, true);
    if (!part1.ok) return;
    paymentId = part1.value.id;

    // 草稿状态的付款不计入已付——钱还没出去。
    const beforeConfirm = await listSchedules(COMPANY_ID, contractId);
    assert.equal(beforeConfirm.progress.paidCents, 0, "草稿付款不该计入已付");

    const confirmed = await confirmPayment(COMPANY_ID, paymentId);
    assert.equal(confirmed.ok, true);

    const after = await listSchedules(COMPANY_ID, contractId);
    assert.equal(after.progress.paidCents, 400000);
    const firstSchedule = after.items.find((item) => item.id === firstId);
    assert.equal(firstSchedule?.status, "partial", "付了一部分应是部分付款");
  });

  await t.test("付款生成的是凭证草稿，方向为借应付、贷银行", async () => {
    const payment = await pool.query<{ voucher_id: string }>(
      `select voucher_id from payments where id = $1`,
      [paymentId]
    );
    const voucherId = payment.rows[0]!.voucher_id;

    const voucher = await pool.query<{ status: string }>(
      `select status from vouchers where id = $1`,
      [voucherId]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "系统生成的凭证一律 draft");

    const lines = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit, credit from voucher_lines where voucher_id = $1 order by sort_order`,
      [voucherId]
    );
    const debit = lines.rows.find((row) => Number(row.debit) > 0);
    const credit = lines.rows.find((row) => Number(row.credit) > 0);

    assert.equal(debit?.account_code, "2202", "付合同款借应付账款");
    assert.equal(credit?.account_code, "1002", "贷银行存款");
    assert.equal(Number(debit!.debit), Number(credit!.credit), "借贷平衡");
  });

  await t.test("确认付款幂等：重复调用不生成第二张凭证", async () => {
    const before = await pool.query<{ count: string }>(
      `select count(*) as count from vouchers where id like 'vch-pay-%'`
    );
    await confirmPayment(COMPANY_ID, paymentId);
    const after = await pool.query<{ count: string }>(
      `select count(*) as count from vouchers where id like 'vch-pay-%'`
    );

    assert.equal(after.rows[0]!.count, before.rows[0]!.count);
  });

  await t.test("付清后期次不再出现在应付列表", async () => {
    // 这是本组最重要的一条：已付清的期次出现在「本月应付」里，
    // 出纳会重复付款。
    const rest = await createPayment({
      companyId: COMPANY_ID,
      reimbursementId: null,
      scheduleId: firstId,
      amountCents: 200000,
      paidOn: "2026-09-30",
      bankAccountCode: "1002",
      createdByUserId: userId,
      note: null
    });
    assert.equal(rest.ok, true);
    if (rest.ok) await confirmPayment(COMPANY_ID, rest.value.id);

    const due = await listDuePayments(COMPANY_ID, { from: "2026-09-01", to: "2026-09-30" });
    assert.equal(
      due.some((item) => item.scheduleId === firstId),
      false,
      "付清的期次不该出现在应付列表"
    );
  });

  await t.test("应付列表按到期日返回未付清的期次", async () => {
    const due = await listDuePayments(COMPANY_ID, { from: "2026-10-01", to: "2026-10-31" });

    // 尾款与质保金都在 10-31 到期，都还没付
    assert.equal(due.length, 2);
    assert.equal(due.every((item) => item.paidCents < item.amountCents), true);
  });

  await t.test("有付款的期次不能作废", async () => {
    // 那些钱已经付出去了，作废会让合同的已付合计凭空少一块，
    // 而账上的付款凭证还在。
    const denied = await cancelSchedule(COMPANY_ID, firstId);

    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.failure.code, "SCHEDULE_HAS_PAYMENT");
  });

  await t.test("主体款付清但质保金未付时，isFullyPaid 为假、isMainPaid 为真", async () => {
    // 这是质保金做成独立一期的核心收益：这个中间态能被准确表达。
    const tailSchedules = await listSchedules(COMPANY_ID, contractId);
    const tail = tailSchedules.items.find((item) => item.periodNo === 2);
    const payTail = await createPayment({
      companyId: COMPANY_ID,
      reimbursementId: null,
      scheduleId: tail!.id,
      amountCents: 300000,
      paidOn: "2026-10-31",
      bankAccountCode: "1002",
      createdByUserId: userId,
      note: null
    });
    assert.equal(payTail.ok, true);
    if (payTail.ok) await confirmPayment(COMPANY_ID, payTail.value.id);

    const { progress } = await listSchedules(COMPANY_ID, contractId);
    assert.equal(progress.isMainPaid, true, "主体款项已付清");
    assert.equal(progress.isFullyPaid, false, "质保金未付，不算全部付清");
    assert.equal(progress.retentionCents, 100000);
  });

  await t.test("导出批次号写回付款单", async () => {
    const count = await markExported(COMPANY_ID, [paymentId], "EXP-20260930-1");
    assert.equal(count, 1);

    const row = await pool.query<{ export_batch_no: string }>(
      `select export_batch_no from payments where id = $1`,
      [paymentId]
    );
    assert.equal(row.rows[0]?.export_batch_no, "EXP-20260930-1");
  });

  await t.test("付款对象必须恰好一个", async () => {
    const none = await createPayment({
      companyId: COMPANY_ID,
      reimbursementId: null,
      scheduleId: null,
      amountCents: 100,
      paidOn: "2026-09-30",
      bankAccountCode: "1002",
      createdByUserId: userId,
      note: null
    });

    assert.equal(none.ok, false);
    if (!none.ok) assert.equal(none.failure.code, "PAYMENT_TARGET_INVALID");
  });
});
