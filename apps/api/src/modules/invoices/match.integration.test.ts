/**
 * 发票匹配建议的路径级断言（V14-D）。
 *
 * 打分与排序已由单测钉住。这里测只有连库才成立的：
 *
 * - 已被别的报销单占用的票**不出现**（不是排在后面）
 * - 已入账（有凭证）的票不出现
 * - 正在编辑的那张单自己占用的票**仍然出现**——否则重新打开已保存的单据时，
 *   已选好的票会从候选里消失，看起来像丢了
 * - 销项票不出现
 * - 截断时说出来
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

test("发票匹配建议", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { suggestInvoices } = await import("./match-store.js");

  const userRow = await pool.query<{ id: string }>(
    "select id from users where company_id=$1 order by id limit 1",
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  const counterpartyId = "cp-v14d";
  await pool.query(
    `insert into counterparties (id, company_id, name, category)
     values ($1, $2, '某某酒店管理有限公司', 'supplier')
     on conflict (id) do nothing`,
    [counterpartyId, COMPANY_ID]
  );

  // 四张进项票，金额与日期各不相同。**测试自建，不依赖种子**——
  // 「取不到就跳过」会让整组用例静默通过，V13-B4 栽过一次。
  const invoices = [
    { id: "inv-v14d-exact", no: "10000001", date: "2026-04-15", total: "1200.00", seller: "某某酒店管理有限公司", verify: "verified" },
    // verify_status 是 not null（默认 pending）——未验真用 'pending' 不用 null。
    { id: "inv-v14d-close", no: "10000002", date: "2026-04-16", total: "1200.50", seller: "某某酒店管理有限公司", verify: "pending" },
    { id: "inv-v14d-taken", no: "10000003", date: "2026-04-15", total: "1200.00", seller: "某某酒店管理有限公司", verify: "verified" },
    { id: "inv-v14d-posted", no: "10000004", date: "2026-04-15", total: "1200.00", seller: "某某酒店管理有限公司", verify: "verified" }
  ];
  for (const inv of invoices) {
    await pool.query(
      `insert into invoices (id, company_id, direction, invoice_type, invoice_no,
                             invoice_date, seller_name, amount, tax_amount, total_amount,
                             verify_status, source)
       values ($1, $2, 'input', 'vat_special', $3, $4::date, $5,
               $6::numeric, 0, $6::numeric, $7, 'manual')
       on conflict (id) do nothing`,
      [inv.id, COMPANY_ID, inv.no, inv.date, inv.seller, inv.total, inv.verify]
    );
  }

  // 一张销项票——不该出现在报销的候选里。
  await pool.query(
    `insert into invoices (id, company_id, direction, invoice_type, invoice_no,
                           invoice_date, seller_name, amount, tax_amount, total_amount, source)
     values ('inv-v14d-output', $1, 'output', 'vat_special', '20000001',
             '2026-04-15'::date, '本公司', 1200, 0, 1200, 'manual')
     on conflict (id) do nothing`,
    [COMPANY_ID]
  );

  const target = { companyId: COMPANY_ID, amountCents: 120_000, expenseOn: "2026-04-15", keyword: "某某酒店", limit: 20 };

  await t.test("金额一致、日期同天、销方匹配、已验真的排第一", async () => {
    const result = await suggestInvoices(target);
    assert.ok(result.suggestions.length >= 2);
    assert.equal(result.suggestions[0]!.invoice.id, "inv-v14d-exact");
    assert.equal(result.suggestions[0]!.score, 90);
    // 「为什么这张排在前面」要答得出来。
    assert.ok(result.suggestions[0]!.reasons.length === 4);
  });

  await t.test("销项票不出现——那是我方开出去的", async () => {
    const result = await suggestInvoices(target);
    assert.equal(
      result.suggestions.some((s) => s.invoice.id === "inv-v14d-output"),
      false
    );
  });

  await t.test("已入账的票不出现", async () => {
    await pool.query(
      `insert into vouchers (id, company_id, voucher_type, summary, status, source,
                             accounting_date, period)
       values ('vch-v14d', $1, 'transfer', '测试', 'draft', 'manual',
               '2026-04-15'::date, '2026-04')
       on conflict (id) do nothing`,
      [COMPANY_ID]
    );
    await pool.query("update invoices set voucher_id='vch-v14d' where id='inv-v14d-posted'");

    const result = await suggestInvoices(target);
    assert.equal(
      result.suggestions.some((s) => s.invoice.id === "inv-v14d-posted"),
      false,
      "已经生成凭证的票还出现在候选里"
    );
  });

  // 另一张报销单占用一张票。
  const otherReimbursementId = "rb-v14d-other";
  await pool.query(
    `insert into reimbursements (id, company_id, reimbursement_no, applicant_user_id,
                                 counterparty_id, expense_date, status)
     values ($1, $2, 'BX-V14D-OTHER', $3, $4, '2026-04-15'::date, 'approved')
     on conflict (id) do nothing`,
    [otherReimbursementId, COMPANY_ID, userId, counterpartyId]
  );
  await pool.query(
    `insert into reimbursement_lines (id, company_id, reimbursement_id, expense_type,
                                      account_code, amount_cents, quantity, invoice_id,
                                      summary, sort_order)
     values ('rbl-v14d-other', $1, $2, 'travel', '660201', 120000, 1, 'inv-v14d-taken', '住宿费', 1)
     on conflict (id) do nothing`,
    [COMPANY_ID, otherReimbursementId]
  );

  await t.test("已被别的报销单占用的票不出现——不是排在后面", async () => {
    // 排在后面意味着还可能被选中，而选中后由库层唯一约束报一个用户看不懂的错。
    const result = await suggestInvoices(target);
    assert.equal(
      result.suggestions.some((s) => s.invoice.id === "inv-v14d-taken"),
      false
    );
  });

  await t.test("正在编辑的那张单自己占用的票仍然出现", async () => {
    // 否则重新打开一张已保存的单据时，已经选好的票会从候选里消失，
    // 看起来像丢了，而用户会去手工再录一张重复的。
    const result = await suggestInvoices({
      ...target,
      excludeReimbursementId: otherReimbursementId
    });
    assert.equal(
      result.suggestions.some((s) => s.invoice.id === "inv-v14d-taken"),
      true
    );
  });

  await t.test("截断时说出来——不说等于假装全看过了", async () => {
    const result = await suggestInvoices({ ...target, limit: 1 });
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.truncated, true);
    assert.ok(result.totalCandidates > 1);

    const notTruncated = await suggestInvoices(target);
    assert.equal(notTruncated.truncated, false);
  });

  await t.test("不设阈值——低分票照样返回", async () => {
    // 金额差很远的目标：所有票都应当还在，只是分数低。
    // 藏起来会让用户以为票不在池子里，转而手工录一张重复的。
    const result = await suggestInvoices({
      ...target,
      amountCents: 999_999_99,
      expenseOn: "2020-01-01",
      keyword: null
    });
    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions.every((s) => s.score === 0 || s.score === 5));
  });

  await t.test("跨租户读不到别家的发票", async () => {
    const result = await suggestInvoices({ ...target, companyId: "cmp-does-not-exist" });
    assert.equal(result.suggestions.length, 0);
    assert.equal(result.totalCandidates, 0);
  });
});
