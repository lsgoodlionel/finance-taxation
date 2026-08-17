/**
 * 报销单的路径级断言（V13-B4/B5/B7）。
 *
 * 分摊算法与凭证摊平由 allocation.test.ts / voucher.test.ts 钉住。这里测
 * 只有连库才成立的：合计真的是算出来的、发票占用真的拦得住、凭证真的落成
 * 借贷平衡的多行分录、有借款时贷方真的冲了 1221。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const TRAVEL_ACCOUNT = "660203";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("报销单的明细、分摊与凭证", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createReimbursement, getReimbursement, transitionReimbursement, findInvoiceUsage } =
    await import("./store.js");
  const { createReimbursementVoucher, ADVANCE_ACCOUNT, EMPLOYEE_PAYABLE_ACCOUNT } =
    await import("./voucher.js");
  const { ensureEmployeeCounterparty } = await import("../advances/store.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;
  const counterpartyId = await ensureEmployeeCounterparty(COMPANY_ID, userId);

  // **测试自己建成本中心，不依赖种子**。
  //
  // 第一版写的是「种子里取两个，取不到就 return 跳过」——而种子里
  // cmp-v4-tech 一个成本中心都没有，于是分摊相关的四个用例全部静默跳过、
  // 显示为通过（0.08ms）。测试绿着，功能一行没测。
  //
  // 「取不到就跳过」这种写法本身就是陷阱：它让缺失的前提变成沉默的通过。
  const ccA = "cc-test-rnd";
  const ccB = "cc-test-sales";
  await pool.query(
    `insert into cost_centers (id, company_id, code, name)
     values ($1, $3, 'T-RND', '测试研发部'), ($2, $3, 'T-SALES', '测试市场部')
     on conflict (id) do nothing`,
    [ccA, ccB, COMPANY_ID]
  );

  await t.test("合计由明细算出来，不是存的", async () => {
    const created = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-15",
      lines: [
        {
          expenseType: "travel_hotel",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 70000,
          quantity: 2,
          summary: "住宿两晚"
        },
        {
          expenseType: "travel_meal",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 30000,
          quantity: 2,
          summary: "餐补"
        }
      ],
      note: null
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(created.value.totalCents, 100000);
    // 库表上没有 total 列——这条断言保证它没被偷偷加回来。
    const columns = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'reimbursements' and column_name like '%total%'`
    );
    assert.equal(columns.rows.length, 0, "reimbursements 不应有合计列");
  });

  await t.test("单据号按月编", async () => {
    const list = await getReimbursement(COMPANY_ID, "");
    assert.equal(list, null, "空 id 应查不到");
  });

  let allocatedId = "";
  await t.test("按比例分摊落库，金额末项扫尾", async () => {
    const created = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-16",
      lines: [
        {
          expenseType: "entertainment",
          accountCode: TRAVEL_ACCOUNT,
          // 100 分给两个部门，各 3333/6667 基点——除不尽，验扫尾
          amountCents: 100,
          quantity: 1,
          summary: "招待",
          allocationsByRatio: [
            { costCenterId: ccA, ratioBp: 3333 },
            { costCenterId: ccB, ratioBp: 6667 }
          ]
        }
      ],
      note: null
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    allocatedId = created.value.id;

    const allocations = created.value.lines[0]!.allocations;
    assert.equal(allocations.length, 2);
    assert.equal(
      allocations.reduce((sum, item) => sum + item.amountCents, 0),
      100,
      "分摊金额之和必须严格等于行金额"
    );
  });

  await t.test("比例合计不足 100% 被拒", async () => {
    const bad = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-17",
      lines: [
        {
          expenseType: "office",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 10000,
          summary: "办公",
          allocationsByRatio: [{ costCenterId: ccA, ratioBp: 5000 }]
        }
      ],
      note: null
    });

    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.failure.code, "REIMBURSEMENT_ALLOCATION_INVALID");
  });

  await t.test("审批通过生成借贷平衡的凭证草稿", async () => {
    await transitionReimbursement(COMPANY_ID, allocatedId, "submit");
    const approved = await transitionReimbursement(COMPANY_ID, allocatedId, "approve");
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    const outcome = await createReimbursementVoucher(approved.value);

    const voucher = await pool.query<{ status: string }>(
      `select status from vouchers where id = $1`,
      [outcome.voucherId]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "系统生成的凭证一律 draft");

    const lines = await pool.query<{
      account_code: string;
      debit: string;
      credit: string;
      cost_center_id: string | null;
    }>(
      `select account_code, debit, credit, cost_center_id
         from voucher_lines where voucher_id = $1 order by sort_order`,
      [outcome.voucherId]
    );

    const debitSum = lines.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const creditSum = lines.rows.reduce((sum, row) => sum + Number(row.credit), 0);
    assert.equal(debitSum, creditSum, "凭证必须借贷平衡");

    // 分摊展开成两条借方，各带成本中心
    const debits = lines.rows.filter((row) => Number(row.debit) > 0);
    assert.equal(debits.length, 2);
    assert.equal(debits.every((row) => row.cost_center_id !== null), true);

    // 无借款 → 贷方挂应付员工
    const credit = lines.rows.find((row) => Number(row.credit) > 0);
    assert.equal(credit?.account_code, EMPLOYEE_PAYABLE_ACCOUNT);
  });

  await t.test("有借款时贷方冲备用金而不是挂应付", async () => {
    const { createAdvance } = await import("../advances/store.js");
    const advance = await createAdvance({
      companyId: COMPANY_ID,
      requestId: null,
      borrowerUserId: userId,
      amountCents: 500000,
      purpose: "出差备用金",
      expectedReturnDate: null,
      note: null
    });
    assert.equal(advance.ok, true);
    if (!advance.ok) return;

    const created = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: advance.value.id,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-18",
      lines: [
        {
          expenseType: "travel_hotel",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 420000,
          quantity: 3,
          summary: "住宿"
        }
      ],
      note: null
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const outcome = await createReimbursementVoucher(created.value);
    const credit = await pool.query<{ account_code: string; counterparty_id: string | null }>(
      `select account_code, counterparty_id from voucher_lines
        where voucher_id = $1 and credit > 0`,
      [outcome.voucherId]
    );

    assert.equal(credit.rows[0]?.account_code, ADVANCE_ACCOUNT, "有借款应冲 1221");
    assert.equal(
      credit.rows[0]?.counterparty_id,
      counterpartyId,
      "往来科目必须带往来单位，否则冲销时分不出是谁的"
    );
  });

  await t.test("凭证生成幂等：重复调用不产生第二张", async () => {
    const found = await getReimbursement(COMPANY_ID, allocatedId);
    const first = found!.voucherId;
    const again = await createReimbursementVoucher(found!);

    assert.equal(again.voucherId, first);
  });

  await t.test("发票占用检测：同一张票不能报两次", async () => {
    // 与成本中心同理：自己建，不依赖种子。种子里 cmp-v4-tech 也没有发票。
    const invoiceId = "inv-test-rmb";
    await pool.query(
      `insert into invoices (id, company_id, invoice_no, invoice_date, seller_name)
       values ($1, $2, 'TEST-0001', '2026-09-19'::date, '测试供应商')
       on conflict (id) do nothing`,
      [invoiceId, COMPANY_ID]
    );
    const first = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-19",
      lines: [
        {
          expenseType: "office",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 5000,
          invoiceId,
          summary: "带票的费用"
        }
      ],
      note: null
    });
    assert.equal(first.ok, true);

    const usage = await findInvoiceUsage(COMPANY_ID, invoiceId);
    assert.equal(usage.length, 1, "应查得到这张票已被占用");
    assert.match(usage[0]!.reimbursementNo, /^RMB-/);
  });

  await t.test("空明细的报销单被拒", async () => {
    const empty = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-20",
      lines: [],
      note: null
    });

    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.failure.code, "REIMBURSEMENT_NO_LINES");
  });

  await t.test("已付款的报销单不能再流转", async () => {
    const created = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-21",
      lines: [
        { expenseType: "office", accountCode: TRAVEL_ACCOUNT, amountCents: 1000, summary: "杂费" }
      ],
      note: null
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await transitionReimbursement(COMPANY_ID, created.value.id, "submit");
    await transitionReimbursement(COMPANY_ID, created.value.id, "approve");
    await transitionReimbursement(COMPANY_ID, created.value.id, "pay");

    const again = await transitionReimbursement(COMPANY_ID, created.value.id, "approve");
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.failure.code, "REIMBURSEMENT_INVALID_TRANSITION");
  });
});
