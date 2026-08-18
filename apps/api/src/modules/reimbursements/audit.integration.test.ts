/**
 * 报销审核与费用分析的路径级断言（V13-D）。
 *
 * 判断逻辑由 audit.test.ts 钉住。这里测只有连库才成立的：重复报销真的
 * 拦得住提交、审核真的排除本单自己、费用分析真的按已批准状态过滤。
 *
 * 「排除本单自己」尤其重要——不排除的话，一张已保存的单据再审核一次
 * 会把自己占的票报成重复，用户永远提交不了。
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

test("报销审核与费用分析", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createReimbursement, transitionReimbursement } = await import("./store.js");
  const { runReimbursementAudit } = await import("./audit-service.js");
  const { buildExpenseAnalysis } = await import("../reports/expense-analysis.js");
  const { ensureEmployeeCounterparty } = await import("../advances/store.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;
  const counterpartyId = await ensureEmployeeCounterparty(COMPANY_ID, userId);

  // 公司抬头与税号：种子里可能没录信用代码，显式补上才测得到税号校验。
  await pool.query(
    `update companies set credit_code = '91440300MA5TEST01A' where id = $1 and credit_code is null`,
    [COMPANY_ID]
  );
  const company = await pool.query<{ name: string; credit_code: string }>(
    `select name, credit_code from companies where id = $1`,
    [COMPANY_ID]
  );
  const companyName = company.rows[0]!.name;
  const creditCode = company.rows[0]!.credit_code;

  // 两张发票：一张抬头正确、一张抬头错误
  await pool.query(
    `insert into invoices (id, company_id, invoice_no, invoice_date, seller_name,
                           buyer_name, buyer_tax_no, total_amount)
     values ('inv-good', $1, 'GOOD-001', '2026-09-10'::date, '某供应商', $2, $3, 500.00),
            ('inv-bad',  $1, 'BAD-001',  '2026-09-10'::date, '某供应商', '别家公司', $3, 500.00)
     on conflict (id) do nothing`,
    [COMPANY_ID, companyName, creditCode]
  );

  const first = await createReimbursement({
    companyId: COMPANY_ID,
    requestId: null,
    advanceId: null,
    applicantUserId: userId,
    counterpartyId,
    expenseDate: "2026-09-10",
    lines: [
      {
        expenseType: "office",
        accountCode: TRAVEL_ACCOUNT,
        amountCents: 50000,
        invoiceId: "inv-good",
        summary: "办公用品"
      }
    ],
    note: null
  });
  assert.equal(first.ok, true);
  const firstId = first.ok ? first.value.id : "";

  await t.test("干净的单据审核通过", async () => {
    const found = await import("./store.js").then((m) =>
      m.getReimbursement(COMPANY_ID, firstId)
    );
    const audit = await runReimbursementAudit(COMPANY_ID, found!);

    assert.equal(audit.level, "ok");
    assert.equal(audit.findings.length, 0);
  });

  await t.test("审核排除本单自己占的发票", async () => {
    // 不排除的话，一张已保存的单据再审核一次会把自己占的票报成重复，
    // 用户永远提交不了。
    const found = await import("./store.js").then((m) =>
      m.getReimbursement(COMPANY_ID, firstId)
    );
    const audit = await runReimbursementAudit(COMPANY_ID, found!);

    assert.equal(
      audit.findings.some((item) => item.code === "audit.duplicate_invoice"),
      false,
      "本单自己占的票不该报重复"
    );
  });

  await t.test("抬头不符报 warn，不拦提交", async () => {
    const withBadInvoice = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-11",
      lines: [
        {
          expenseType: "office",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 50000,
          invoiceId: "inv-bad",
          summary: "抬头错的票"
        }
      ],
      note: null
    });
    assert.equal(withBadInvoice.ok, true);
    if (!withBadInvoice.ok) return;

    const audit = await runReimbursementAudit(COMPANY_ID, withBadInvoice.value);
    assert.equal(audit.level, "warn");
    assert.ok(audit.findings.find((item) => item.code === "audit.invoice_title_mismatch"));

    // warn 不拦提交
    const submitted = await transitionReimbursement(
      COMPANY_ID,
      withBadInvoice.value.id,
      "submit"
    );
    assert.equal(submitted.ok, true, "warn 级别应放行");
  });

  await t.test("重复用票的第二张单据审核报 block", async () => {
    // inv-good 已被第一张单占用
    const duplicate = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-12",
      lines: [
        {
          expenseType: "office",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 50000,
          // createReimbursement 里已有一道占用检查，会先拦住——
          // 所以这里直接绕过它，用库操作造出「已存在重复」的状态，
          // 验证审核本身也能发现。两道防线各测各的。
          invoiceId: null,
          summary: "重复用票"
        }
      ],
      note: null
    });
    assert.equal(duplicate.ok, true);
    if (!duplicate.ok) return;

    await pool.query(
      `update reimbursement_lines set invoice_id = 'inv-good' where reimbursement_id = $1`,
      [duplicate.value.id]
    );

    const found = await import("./store.js").then((m) =>
      m.getReimbursement(COMPANY_ID, duplicate.value.id)
    );
    const audit = await runReimbursementAudit(COMPANY_ID, found!);

    assert.equal(audit.level, "block");
    assert.ok(audit.findings.find((item) => item.code === "audit.duplicate_invoice"));
  });

  await t.test("报销金额超过发票金额报 warn", async () => {
    const over = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-13",
      lines: [
        {
          expenseType: "office",
          accountCode: TRAVEL_ACCOUNT,
          // 发票 500 元，报 800
          amountCents: 80000,
          invoiceId: null,
          summary: "报得比票多"
        }
      ],
      note: null
    });
    assert.equal(over.ok, true);
    if (!over.ok) return;

    await pool.query(
      `insert into invoices (id, company_id, invoice_no, invoice_date, seller_name,
                             buyer_name, buyer_tax_no, total_amount)
       values ('inv-small', $1, 'SMALL-001', '2026-09-13'::date, '某供应商', $2, $3, 500.00)
       on conflict (id) do nothing`,
      [COMPANY_ID, companyName, creditCode]
    );
    await pool.query(
      `update reimbursement_lines set invoice_id = 'inv-small' where reimbursement_id = $1`,
      [over.value.id]
    );

    const found = await import("./store.js").then((m) =>
      m.getReimbursement(COMPANY_ID, over.value.id)
    );
    const audit = await runReimbursementAudit(COMPANY_ID, found!);

    assert.ok(audit.findings.find((item) => item.code === "audit.amount_exceeds_invoice"));
  });

  await t.test("超标按种子标准判定", async () => {
    // 种子播了「住宿 300/晚，超标 warn」与「M2 一线 600/晚，escalate」。
    // 职级为 null 时只命中通配那条（300/晚 warn）。
    const overrun = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-14",
      lines: [
        {
          expenseType: "travel_hotel",
          accountCode: TRAVEL_ACCOUNT,
          // 300 × 2 晚 = 600 限额，报 1000
          amountCents: 100000,
          quantity: 2,
          invoiceId: null,
          summary: "住宿超标"
        }
      ],
      note: null
    });
    assert.equal(overrun.ok, true);
    if (!overrun.ok) return;

    const audit = await runReimbursementAudit(COMPANY_ID, overrun.value);
    const finding = audit.findings.find((item) => item.code === "standard.overrun");

    assert.ok(finding, "应命中种子里的住宿标准");
    assert.equal(finding.level, "warn", "通配标准的策略是 warn");
    assert.match(finding.message, /超标 400\.00/);
  });

  await t.test("费用分析只统计已批准及之后的单据", async () => {
    const analysis = await buildExpenseAnalysis(COMPANY_ID, "2026-09");

    // 上面造的单据大多停在 draft/pending，只有一张走到了 pending——
    // 都不该计入。
    assert.equal(analysis.totalCents, 0, "草稿与审批中的不该计入");
  });

  await t.test("批准后进入费用分析，按类型分组", async () => {
    const target = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-25",
      lines: [
        {
          expenseType: "training",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 30000,
          invoiceId: null,
          summary: "培训费"
        }
      ],
      note: null
    });
    assert.equal(target.ok, true);
    if (!target.ok) return;

    await transitionReimbursement(COMPANY_ID, target.value.id, "submit");
    await transitionReimbursement(COMPANY_ID, target.value.id, "approve");

    const analysis = await buildExpenseAnalysis(COMPANY_ID, "2026-09");
    assert.equal(analysis.totalCents, 30000);

    const training = analysis.byExpenseType.find((row) => row.key === "training");
    assert.ok(training);
    assert.equal(training.label, "培训", "费用类型应显示中文名");
    assert.equal(training.amountCents, 30000);

    const applicant = analysis.byApplicant.find((row) => row.key === userId);
    assert.ok(applicant, "应能按人员分组");
  });

  await t.test("没分摊的行归「未指定部门」", async () => {
    const analysis = await buildExpenseAnalysis(COMPANY_ID, "2026-09");
    const unassigned = analysis.byCostCenter.find((row) => row.key === "__unassigned__");

    // 与 V12-D1 部门费用报表一致：不丢弃也不摊派。
    assert.ok(unassigned, "未分摊的费用应单列");
    assert.equal(unassigned.label, "未指定部门");
  });

  await t.test("按职级 + 城市匹配到更具体的标准（V13 残留 8）", async () => {
    // 种子里有两条住宿标准：通配 300/晚 warn、M2 一线 600/晚 escalate。
    // 给用户设上 M2 职级、给行标上 tier1，就该命中后者。
    await pool.query(`update users set grade_code = 'M2' where id = $1`, [userId]);

    const overrun = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-26",
      lines: [
        {
          expenseType: "travel_hotel",
          accountCode: TRAVEL_ACCOUNT,
          // M2 一线标准 600/晚 × 2 晚 = 1200 限额，报 1500 → 超 300
          amountCents: 150000,
          quantity: 2,
          cityTier: "tier1",
          invoiceId: null,
          summary: "上海住宿"
        }
      ],
      note: null
    });
    assert.equal(overrun.ok, true);
    if (!overrun.ok) return;

    const audit = await runReimbursementAudit(COMPANY_ID, overrun.value);
    const finding = audit.findings.find((item) => item.code === "standard.overrun");

    assert.ok(finding, "应命中标准");
    assert.equal(finding.level, "escalate", "M2 一线的标准策略是加签，不是通配那条的 warn");
    assert.match(finding.message, /超标 300\.00/, "应按 600/晚 而非 300/晚 判定");
  });

  await t.test("同一行未设城市时退回通配标准", async () => {
    // 城市没填就只能按通配判——不能拿一线的宽标准去套。
    const noCity = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-27",
      lines: [
        {
          expenseType: "travel_hotel",
          accountCode: TRAVEL_ACCOUNT,
          amountCents: 150000,
          quantity: 2,
          cityTier: null,
          invoiceId: null,
          summary: "未填城市"
        }
      ],
      note: null
    });
    assert.equal(noCity.ok, true);
    if (!noCity.ok) return;

    const audit = await runReimbursementAudit(COMPANY_ID, noCity.value);
    const finding = audit.findings.find((item) => item.code === "standard.overrun");

    assert.ok(finding);
    // 通配 300/晚 × 2 = 600 限额，报 1500 → 超 900
    assert.match(finding.message, /超标 900\.00/, "未填城市应按通配标准判");
  });

  await t.test("同单内两行用同一张票由数据库唯一约束挡住", async () => {
    // 原本想测「逐行审核后同单内重复仍查得出」，写完发现**这个状态在库层
    // 根本造不出来**：uq_reimbursement_line_invoice 是 (reimbursement_id,
    // invoice_id) 唯一约束。
    //
    // 于是真正的防线是数据库，审核引擎里的 duplicate_invoice_in_form 是
    // 第二层保险（绕过创建接口直接调引擎时才用得上）。这条用例改为钉住
    // 库层拦截——那才是实际生效的那一道。
    const dup = await createReimbursement({
      companyId: COMPANY_ID,
      requestId: null,
      advanceId: null,
      applicantUserId: userId,
      counterpartyId,
      expenseDate: "2026-09-28",
      lines: [
        { expenseType: "office", accountCode: TRAVEL_ACCOUNT, amountCents: 1000, summary: "行一" },
        { expenseType: "office", accountCode: TRAVEL_ACCOUNT, amountCents: 2000, summary: "行二" }
      ],
      note: null
    });
    assert.equal(dup.ok, true);
    if (!dup.ok) return;

    await pool.query(
      `insert into invoices (id, company_id, invoice_no, invoice_date, seller_name,
                             buyer_name, buyer_tax_no, total_amount)
       values ('inv-dupline', $1, 'DUPLINE-001', '2026-09-28'::date, '某供应商', $2, $3, 100.00)
       on conflict (id) do nothing`,
      [COMPANY_ID, companyName, creditCode]
    );

    await assert.rejects(
      () =>
        pool.query(
          `update reimbursement_lines set invoice_id = 'inv-dupline' where reimbursement_id = $1`,
          [dup.value.id]
        ),
      /uq_reimbursement_line_invoice/,
      "同单内两行指向同一张票应被唯一约束拒绝"
    );
  });

  await t.test("跨年月份的分析不报错", async () => {
    // nextMonthFirstDay 的 12 月进位——漏了会让 12 月的报表永远没数据。
    const december = await buildExpenseAnalysis(COMPANY_ID, "2026-12");
    assert.equal(december.period, "2026-12");
  });
});
