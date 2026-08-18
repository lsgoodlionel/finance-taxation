/**
 * 验收单与三单匹配的路径级断言（V13 残留 7）。
 *
 * 匹配规则由 three-way-match.test.ts 钉住。这里测取数——而取数的难点全在
 * **「没有记录」与「记录金额为零」的区分**上：
 *
 * - 合同没有验收单 → 不做验收判定（服务、租赁类合同本就不验收）
 * - 有验收单但草稿状态 → 不算数（还没确认）
 * - 匹配不到发票 → 传 null 而不是 0（0 会报出「验收超过开票」的假告警）
 *
 * 弄反任何一处，不需要验收的合同就会永远带着一条消不掉的告警——
 * 而那种告警用户学会的第一件事就是无视它。
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

test("验收单与三单匹配", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createAcceptance, transitionAcceptance, matchScheduleThreeWay, listAcceptances } =
    await import("./store.js");
  const { createSchedule } = await import("../contracts/schedule-store.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  const contractId = "ct-acc-test";
  await pool.query(
    `insert into contracts (id, company_id, contract_no, contract_type, title,
                            counterparty_name, amount, signed_date, status,
                            created_by_user_id, created_by_name)
     values ($1, $2, 'HT-ACC-001', 'purchase', '设备采购', '验收测试供应商',
             100000, '2026-11-01'::date, 'active', $3, '测试')
     on conflict (id) do nothing`,
    [contractId, COMPANY_ID, userId]
  );

  const schedule = await createSchedule({
    companyId: COMPANY_ID,
    contractId,
    periodNo: 1,
    title: "货到付款",
    dueDate: "2026-11-30",
    amountCents: 100000,
    ratioBp: 10000,
    scheduleType: "normal",
    retentionReleaseDate: null,
    note: null
  });
  assert.equal(schedule.ok, true);
  const scheduleId = schedule.ok ? schedule.value.id : "";

  await t.test("没有验收单时不做验收判定", async () => {
    // 服务、租赁类合同本就不验收。报「未验收」会让它永远带着一条
    // 消不掉的告警，而那种告警用户学会的第一件事就是无视它。
    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 100000);

    assert.equal(
      findings.some((item) => item.code.includes("acceptance")),
      false,
      "没有验收记录就不该报验收相关的问题"
    );
  });

  let acceptanceId = "";
  await t.test("草稿状态的验收单不算数", async () => {
    const created = await createAcceptance({
      companyId: COMPANY_ID,
      contractId,
      scheduleId,
      acceptedOn: "2026-11-20",
      amountCents: 40000,
      quantityNote: "服务器 4 台",
      acceptedByUserId: userId,
      note: null
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    acceptanceId = created.value.id;
    assert.match(created.value.acceptanceNo, /^ACC-202611-\d{4}$/);

    // 还是草稿——不该被汇总进去
    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 100000);
    assert.equal(
      findings.some((item) => item.code === "match.payment_exceeds_acceptance"),
      false,
      "草稿验收单不该参与汇总"
    );
  });

  await t.test("确认后参与汇总，付款超验收报 warn", async () => {
    const confirmed = await transitionAcceptance(COMPANY_ID, acceptanceId, "confirm");
    assert.equal(confirmed.ok, true);

    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 100000);
    const finding = findings.find((item) => item.code === "match.payment_exceeds_acceptance");

    assert.ok(finding, "付 1000 而只验收了 400，应当提示");
    assert.equal(finding.level, "warn", "预付款合法，不能 block");
    assert.match(finding.message, /400\.00/);
  });

  await t.test("验收补足后不再提示", async () => {
    const rest = await createAcceptance({
      companyId: COMPANY_ID,
      contractId,
      scheduleId,
      acceptedOn: "2026-11-25",
      amountCents: 60000,
      quantityNote: "服务器 6 台",
      acceptedByUserId: userId,
      note: null
    });
    assert.equal(rest.ok, true);
    if (!rest.ok) return;
    await transitionAcceptance(COMPANY_ID, rest.value.id, "confirm");

    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 100000);
    assert.equal(
      findings.some((item) => item.code === "match.payment_exceeds_acceptance"),
      false,
      "累计验收 1000 = 付款 1000，不该再提示"
    );
  });

  await t.test("匹配不到发票时不报「验收超过开票」", async () => {
    // 这是最容易写错的一处：匹配不到发票传 0 会让每一份没开票的合同
    // 都报一条「验收超过开票」——而那在货到票未到时是常态。
    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 0);

    assert.equal(
      findings.some((item) => item.code === "match.acceptance_exceeds_invoice"),
      false,
      "没有任何发票记录时应传 null，不做开票判定"
    );
  });

  await t.test("有发票且金额少于验收时提示催票", async () => {
    await pool.query(
      `insert into invoices (id, company_id, invoice_no, invoice_date, seller_name,
                             direction, total_amount)
       values ('inv-acc', $1, 'ACC-INV-001', '2026-11-26'::date, '验收测试供应商',
               'in', 600.00)
       on conflict (id) do nothing`,
      [COMPANY_ID]
    );

    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 0);
    const finding = findings.find((item) => item.code === "match.acceptance_exceeds_invoice");

    assert.ok(finding, "验收 1000 而只开了 600 的票");
    assert.match(finding.message, /催/, "措辞应是待催票而非异常");
    assert.match(finding.message, /400\.00/, "应报出差额");
  });

  await t.test("累计已付计入判定", async () => {
    // 分批付款时前几笔要算进来。先造一笔已确认的付款。
    await pool.query(
      `insert into payments (id, company_id, payment_no, schedule_id, amount_cents,
                             paid_on, status, created_by_user_id)
       values ('pay-acc', $1, 'PAY-ACC-0001', $2, 90000, '2026-11-27'::date, 'paid', $3)
       on conflict (id) do nothing`,
      [COMPANY_ID, scheduleId, userId]
    );

    // 已付 900 + 本次 200 = 1100 > 验收 1000
    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 20000);
    const finding = findings.find((item) => item.code === "match.payment_exceeds_acceptance");

    assert.ok(finding, "累计付款应计入");
    assert.match(finding.message, /1100\.00/);
  });

  await t.test("作废的验收单退出汇总", async () => {
    await transitionAcceptance(COMPANY_ID, acceptanceId, "cancel");

    const findings = await matchScheduleThreeWay(COMPANY_ID, scheduleId, 0);
    const finding = findings.find((item) => item.code === "match.acceptance_exceeds_invoice");

    // 验收从 1000 降到 600，与发票 600 相等——不再有差额
    assert.equal(finding, undefined, "作废后累计验收 600 = 开票 600");
  });

  await t.test("已确认的验收单不能退回草稿", async () => {
    // 那会让「确认过」这个事实消失，而下游的三单匹配已经按它算过了。
    const list = await listAcceptances(COMPANY_ID, { contractId });
    const confirmed = list.find((item) => item.status === "confirmed");
    assert.ok(confirmed);

    const denied = await transitionAcceptance(COMPANY_ID, confirmed.id, "confirm");
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.failure.code, "ACCEPTANCE_INVALID_TRANSITION");
  });

  await t.test("一次性验收：不填期次时按合同汇总", async () => {
    const wholeContract = "ct-acc-whole";
    await pool.query(
      `insert into contracts (id, company_id, contract_no, contract_type, title,
                              counterparty_name, amount, signed_date, status,
                              created_by_user_id, created_by_name)
       values ($1, $2, 'HT-ACC-002', 'purchase', '一次性验收合同', '另一供应商',
               50000, '2026-11-01'::date, 'active', $3, '测试')
       on conflict (id) do nothing`,
      [wholeContract, COMPANY_ID, userId]
    );
    const wholeSchedule = await createSchedule({
      companyId: COMPANY_ID,
      contractId: wholeContract,
      periodNo: 1,
      title: "全款",
      dueDate: "2026-12-31",
      amountCents: 50000,
      ratioBp: 10000,
      scheduleType: "normal",
      retentionReleaseDate: null,
      note: null
    });
    assert.equal(wholeSchedule.ok, true);
    if (!wholeSchedule.ok) return;

    // 验收单不填 scheduleId——一次性验收的合同就是这样
    const acc = await createAcceptance({
      companyId: COMPANY_ID,
      contractId: wholeContract,
      scheduleId: null,
      acceptedOn: "2026-12-01",
      amountCents: 50000,
      quantityNote: "整批验收",
      acceptedByUserId: userId,
      note: null
    });
    assert.equal(acc.ok, true);
    if (!acc.ok) return;
    await transitionAcceptance(COMPANY_ID, acc.value.id, "confirm");

    // 期次上没有验收单，应退回按合同汇总，从而不报「付款超验收」
    const findings = await matchScheduleThreeWay(COMPANY_ID, wholeSchedule.value.id, 50000);
    assert.equal(
      findings.some((item) => item.code === "match.payment_exceeds_acceptance"),
      false,
      "不填期次的验收单应按合同汇总，覆盖该合同下的期次"
    );
  });
});
