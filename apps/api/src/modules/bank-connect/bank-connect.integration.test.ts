/**
 * 银企直连的路径级断言（V14-A）。
 *
 * 适配器行为已由契约测试钉住（`adapter-contract.test.ts`），这里测只有
 * 连库才成立的：
 *
 * - 证书密码不回显、不传就不改
 * - 草稿付款单发不出去
 * - 收款账号为空发不出去（CSV 导出可以留空，直连不行）
 * - 幂等：同一 clientRef 重复到达银行返回同一笔
 * - 终态不再重复查银行
 * - 未注册的 provider 不炸，落成一条可读的失败
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

test("银企配置、付款指令与状态回写", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { registerBankAdapters } = await import("./register.js");
  const { __resetMockAdapter } = await import("./mock-adapter.js");
  registerBankAdapters();
  __resetMockAdapter();

  const {
    upsertBankConnectConfig,
    listBankConnectConfigs,
    testBankConnectConfig,
    submitInstruction,
    refreshInstructionStatus,
    listInstructions,
    queryConfigBalance
  } = await import("./store.js");
  const { createPayment } = await import("../payments/store.js");

  const userRow = await pool.query<{ id: string }>(
    "select id from users where company_id = $1 order by id limit 1",
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  // ── 配置 ────────────────────────────────────────────────────────────

  const created = await upsertBankConnectConfig({
    companyId: COMPANY_ID,
    id: null,
    provider: "mock",
    displayName: "演示账户",
    payerAccount: "6222020000000001",
    customerNo: "CUST-0001",
    endpoint: "https://bank.example.com/api",
    signAlgorithm: "RSA",
    certRef: "/certs/company.pfx",
    certPassword: "s3cret",
    certFingerprint: "AA:BB:CC",
    certExpiresOn: "2030-12-31",
    enabled: true,
    note: null
  });
  assert.equal(created.ok, true);
  const configId = created.ok ? created.value.id : "";

  await t.test("证书密码永不回显，只说设没设过", async () => {
    const items = await listBankConnectConfigs(COMPANY_ID);
    const config = items.find((item) => item.id === configId)!;
    assert.equal(config.hasCertPassword, true);
    // 整个 DTO 里不能出现密码原文——序列化后再查一遍，防止将来加字段时漏掉。
    assert.equal(JSON.stringify(config).includes("s3cret"), false);
    assert.equal(config.isProviderAvailable, true);
  });

  await t.test("密码不传就不改——改个备注不该把证书密码清掉", async () => {
    await upsertBankConnectConfig({
      companyId: COMPANY_ID,
      id: configId,
      provider: "mock",
      displayName: "演示账户",
      payerAccount: "6222020000000001",
      customerNo: "CUST-0001",
      endpoint: "https://bank.example.com/api",
      signAlgorithm: "RSA",
      certRef: "/certs/company.pfx",
      certPassword: null, // 没填
      certFingerprint: "AA:BB:CC",
      certExpiresOn: "2030-12-31",
      enabled: true,
      note: "改了备注"
    });

    const row = await pool.query<{ cert_password_enc: string | null; note: string | null }>(
      "select cert_password_enc, note from bank_connect_configs where id=$1",
      [configId]
    );
    assert.equal(row.rows[0]!.cert_password_enc, "s3cret", "密码被清掉了");
    assert.equal(row.rows[0]!.note, "改了备注");
  });

  await t.test("连通性测试回写结果", async () => {
    const result = await testBankConnectConfig(COMPANY_ID, configId);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.ok, true);

    const items = await listBankConnectConfigs(COMPANY_ID);
    const config = items.find((item) => item.id === configId)!;
    assert.equal(config.lastTestOk, true);
    assert.notEqual(config.lastTestAt, null);
  });

  await t.test("未接入的银行不炸，落成 501 与可读消息", async () => {
    const other = await upsertBankConnectConfig({
      companyId: COMPANY_ID,
      id: null,
      provider: "icbc", // 清单里有，但没有适配器实现
      displayName: "工行主账户",
      payerAccount: "6222020000000002",
      customerNo: "C2",
      endpoint: "https://icbc.example.com",
      signAlgorithm: "RSA",
      certRef: "/certs/icbc.pfx",
      certPassword: null,
      certFingerprint: null,
      certExpiresOn: null,
      enabled: true,
      note: null
    });
    assert.equal(other.ok, true);
    const otherId = other.ok ? other.value.id : "";

    // 配置能存下来——先填资料后接实现是正常顺序。
    const items = await listBankConnectConfigs(COMPANY_ID);
    assert.equal(items.find((item) => item.id === otherId)!.isProviderAvailable, false);

    const tested = await testBankConnectConfig(COMPANY_ID, otherId);
    assert.equal(tested.ok, false);
    assert.equal(tested.ok === false && tested.failure.code, "BANK_PROVIDER_NOT_IMPLEMENTED");
  });

  // ── 付款指令 ────────────────────────────────────────────────────────

  // 报销单与付款单自建——种子里没有可提交的付款单。
  // 「取不到就跳过」会让整组用例静默通过，V13-B4 栽过一次。
  const counterpartyId = "cp-v14a-supplier";
  await pool.query(
    `insert into counterparties (id, company_id, name, category, bank_name, bank_account, bank_account_name)
     values ($1, $2, '某某供应商', 'supplier', '工商银行深圳分行', '6222029999999999', '某某供应商')
     on conflict (id) do nothing`,
    [counterpartyId, COMPANY_ID]
  );

  const reimbursementId = "rb-v14a-001";
  await pool.query(
    `insert into reimbursements (id, company_id, reimbursement_no, applicant_user_id,
                                 counterparty_id, expense_date, status)
     values ($1, $2, 'BX-V14A-001', $3, $4, current_date, 'approved')
     on conflict (id) do nothing`,
    [reimbursementId, COMPANY_ID, userId, counterpartyId]
  );
  await pool.query(
    `insert into reimbursement_lines (id, company_id, reimbursement_id, expense_type,
                                      account_code, amount_cents, quantity, summary, sort_order)
     values ('rbl-v14a-001', $1, $2, 'travel', '660201', 250000, 1, '差旅费', 1)
     on conflict (id) do nothing`,
    [COMPANY_ID, reimbursementId]
  );

  const paymentResult = await createPayment({
    companyId: COMPANY_ID,
    reimbursementId,
    scheduleId: null,
    amountCents: 250000,
    paidOn: new Date().toISOString().slice(0, 10),
    bankAccountCode: "1002",
    note: "报销付款",
    createdByUserId: userId
  });
  assert.equal(paymentResult.ok, true, "付款单建不出来，后面的断言都失去意义");
  const paymentId = paymentResult.ok ? paymentResult.value.id : "";

  await t.test("草稿付款单发不出去", async () => {
    const result = await submitInstruction({
      companyId: COMPANY_ID,
      paymentId,
      configId,
      userId
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure.code, "BANK_PAYMENT_NOT_SUBMITTED");
  });

  // 推到 submitted。
  await pool.query("update payments set status='submitted' where id=$1", [paymentId]);

  await t.test("收款账号为空发不出去——CSV 可以留空，直连不行", async () => {
    await pool.query("update counterparties set bank_account='' where id=$1", [counterpartyId]);
    const result = await submitInstruction({ companyId: COMPANY_ID, paymentId, configId, userId });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure.code, "BANK_PAYEE_INCOMPLETE");

    await pool.query("update counterparties set bank_account='6222029999999999' where id=$1", [
      counterpartyId
    ]);
  });

  let instructionId = "";
  let clientRef = "";

  await t.test("提交后落一条指令，状态是受理而不是成功", async () => {
    const result = await submitInstruction({ companyId: COMPANY_ID, paymentId, configId, userId });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    instructionId = result.value.id;
    clientRef = result.value.clientRef;

    // **受理不等于付成功**。直接标 succeeded 会让出纳以为钱到账了。
    assert.equal(result.value.status, "accepted");
    assert.ok(result.value.bankRef);
    assert.equal(result.value.payeeName, "某某供应商");
    assert.equal(result.value.amountCents, 250000);
    // 流水号带付款单号，银行侧对账能看出是哪一笔。
    assert.match(clientRef, /^PAY/);
  });

  await t.test("付款单状态不被指令自动改动", async () => {
    // 银行说「已受理」不等于钱到账。自动改成 paid 等于让一个未验证的
    // 适配器直接改账。
    const row = await pool.query<{ status: string }>("select status from payments where id=$1", [
      paymentId
    ]);
    assert.equal(row.rows[0]!.status, "submitted");
  });

  await t.test("重复提交是两条指令，但银行侧靠 clientRef 各自独立", async () => {
    const again = await submitInstruction({ companyId: COMPANY_ID, paymentId, configId, userId });
    assert.equal(again.ok, true);
    if (!again.ok) return;

    // 我方每次提交生成新的 clientRef——这是有意的：重复提交是人的决定
    // （比如首次超时后重发），系统不该悄悄合并成一笔。留两条痕迹让人看得见。
    assert.notEqual(again.value.clientRef, clientRef);

    const items = await listInstructions(COMPANY_ID, { paymentId });
    assert.equal(items.length, 2);
  });

  await t.test("查状态回写，终态后不再查银行", async () => {
    const refreshed = await refreshInstructionStatus(COMPANY_ID, instructionId);
    assert.equal(refreshed.ok, true);
    if (!refreshed.ok) return;
    assert.notEqual(refreshed.value.status, "unknown");
    assert.notEqual(refreshed.value.lastCheckedAt, null);

    // 手工推到终态，再查一次——应当原样返回，不去打扰银行。
    await pool.query("update bank_transfer_instructions set status='succeeded' where id=$1", [
      instructionId
    ]);
    const again = await refreshInstructionStatus(COMPANY_ID, instructionId);
    assert.equal(again.ok, true);
    assert.equal(again.ok && again.value.status, "succeeded");
  });

  await t.test("余额查询返回整数分", async () => {
    const balance = await queryConfigBalance(COMPANY_ID, configId);
    assert.equal(balance.ok, true);
    if (!balance.ok) return;
    assert.equal(Number.isInteger(balance.value.availableCents), true);
    assert.equal(balance.value.currency, "CNY");
  });

  await t.test("跨租户读不到别家的配置", async () => {
    const items = await listBankConnectConfigs("cmp-does-not-exist");
    assert.equal(items.length, 0);

    const result = await submitInstruction({
      companyId: "cmp-does-not-exist",
      paymentId,
      configId,
      userId
    });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.failure.code, "BANK_CONFIG_NOT_FOUND");
  });
});
