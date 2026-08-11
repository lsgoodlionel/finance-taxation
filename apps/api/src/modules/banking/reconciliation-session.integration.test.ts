/**
 * 银行余额调节表的**路径级**断言（V12-C3）。
 *
 * 交叉方向、差额不凑平已由 balance-reconciliation.test.ts 钉住。这里测的是
 * 只有连上数据库才暴露的东西：未达账项识别得对不对（哪些流水算未达、
 * 哪些账面分录算未达）、封存快照是否真的冻结、共用科目的告警是否发得出来。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const ACCOUNT_ID = "bank-recon-test";

function createAuthContext(): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-accountant"],
    token: "test-token"
  };
}

function createResponseCapture() {
  let statusCode = 200;
  let body = "";
  const response = {
    writeHead(next: number) {
      statusCode = next;
      return response;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
      return response;
    }
  } as unknown as ServerResponse;
  return {
    response,
    readJson() {
      return { statusCode, body: body ? (JSON.parse(body) as Record<string, any>) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function seedLedgerEntry(
  pool: pg.Pool,
  params: { id: string; debit: string; credit: string; entryDate: string; summary: string }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', $3, 'posted', 'test', $4::date, $5, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.summary, params.entryDate, params.entryDate.slice(0, 7)]
  );
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, business_event_id, entry_date, summary,
       account_code, account_name, debit, credit, source, posted_at
     ) values ($1, $2, $3, null, $4::date, $5, '1002', '银行存款', $6::numeric, $7::numeric,
               'voucher_posting', now())`,
    [params.id, COMPANY_ID, voucherId, params.entryDate, params.summary, params.debit, params.credit]
  );
}

async function seedStatement(
  pool: pg.Pool,
  params: {
    id: string;
    amount: string;
    date: string;
    matchStatus: string;
    matchedVoucherId?: string | null;
    description: string;
  }
): Promise<void> {
  await pool.query(
    `insert into bank_statements (
       id, company_id, bank_account_id, transaction_date, amount, transaction_ref,
       description, match_status, matched_voucher_id
     ) values ($1, $2, $3, $4::date, $5::numeric, $1, $6, $7, $8)`,
    [
      params.id,
      COMPANY_ID,
      ACCOUNT_ID,
      params.date,
      params.amount,
      params.description,
      params.matchStatus,
      params.matchedVoucherId ?? null
    ]
  );
}

async function getBalance(query: string) {
  const { getBalanceReconciliationRoute } = await import("./reconciliation-session.routes.js");
  const capture = createResponseCapture();
  await getBalanceReconciliationRoute(
    {
      method: "GET",
      url: `/api/banking/reconciliation/balance?${query}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function close(body: Record<string, unknown>) {
  const { closeReconciliationRoute } = await import("./reconciliation-session.routes.js");
  const capture = createResponseCapture();
  await closeReconciliationRoute(
    {
      method: "POST",
      url: "/api/banking/reconciliation/close",
      auth: createAuthContext(),
      body
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("银行余额调节表与对账封存的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await pool.query(
    `insert into bank_accounts (id, company_id, bank_name, account_no, account_name, account_code)
     values ($1, $2, '测试银行', '6222000000001', '测试户', '1002')`,
    [ACCOUNT_ID, COMPANY_ID]
  );

  // 账面：收 100 万（已匹配）、收 30 万（银行未收，在途存款）、付 20 万（银行未付）
  await seedLedgerEntry(pool, { id: "le-bank-1", debit: "1000000.00", credit: "0.00", entryDate: "2026-06-05", summary: "销售回款" });
  await seedLedgerEntry(pool, { id: "le-bank-2", debit: "300000.00", credit: "0.00", entryDate: "2026-06-29", summary: "月底存入支票" });
  await seedLedgerEntry(pool, { id: "le-bank-3", debit: "0.00", credit: "200000.00", entryDate: "2026-06-30", summary: "开票付货款" });

  // 银行：100 万那笔已匹配；另有企业未记的利息 500 与扣费 200
  await seedStatement(pool, { id: "st-1", amount: "1000000.00", date: "2026-06-05", matchStatus: "manual", matchedVoucherId: "vch-le-bank-1", description: "销售回款" });
  await seedStatement(pool, { id: "st-2", amount: "500.00", date: "2026-06-30", matchStatus: "unmatched", description: "结息" });
  await seedStatement(pool, { id: "st-3", amount: "-200.00", date: "2026-06-30", matchStatus: "unmatched", description: "账户管理费" });
  // 被人工排除的流水不该进未达账项
  await seedStatement(pool, { id: "st-4", amount: "-999.00", date: "2026-06-30", matchStatus: "excluded", description: "银行内部冲正" });

  await t.test("对账单余额必填，不默认成 0", async () => {
    const missing = await getBalance(`bankAccountId=${ACCOUNT_ID}&asOf=2026-06-30`);
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.body?.code, "STATEMENT_BALANCE_REQUIRED");
  });

  await t.test("四类未达账项识别正确，excluded 的流水不算未达", async () => {
    // 银行实际余额 = 100 万 + 500 − 200 = 1000300
    const preview = await getBalance(
      `bankAccountId=${ACCOUNT_ID}&asOf=2026-06-30&statementBalance=1000300.00`
    );
    assert.equal(preview.statusCode, 200, JSON.stringify(preview.body));

    assert.equal(preview.body?.subtotals.bookOnlyReceipt, "300000.00", "在途存款");
    assert.equal(preview.body?.subtotals.bookOnlyPayment, "200000.00", "未兑付支票");
    assert.equal(preview.body?.subtotals.bankOnlyReceipt, "500.00", "银行代收利息");
    assert.equal(preview.body?.subtotals.bankOnlyPayment, "200.00", "银行扣费");

    const items = preview.body?.items as { sourceId: string }[];
    assert.ok(!items.some((item) => item.sourceId === "st-4"), "excluded 的流水不是未达账项");
    assert.ok(!items.some((item) => item.sourceId === "le-bank-1"), "已匹配的账面分录不是未达账项");
  });

  await t.test("调节后两侧相等，对账通过", async () => {
    const preview = await getBalance(
      `bankAccountId=${ACCOUNT_ID}&asOf=2026-06-30&statementBalance=1000300.00`
    );
    // 账面余额 = 100万 + 30万 − 20万 = 1100000
    assert.equal(preview.body?.bookBalance, "1100000.00");
    // 银行侧：1000300 + 300000 − 200000 = 1100300
    assert.equal(preview.body?.adjustedStatementBalance, "1100300.00");
    // 账面侧：1100000 + 500 − 200 = 1100300
    assert.equal(preview.body?.adjustedBookBalance, "1100300.00");
    assert.equal(preview.body?.balanced, true);
    assert.equal(preview.body?.difference, "0.00");
  });

  await t.test("对账单余额抄错时差额显式列出且不被凑平", async () => {
    const preview = await getBalance(
      `bankAccountId=${ACCOUNT_ID}&asOf=2026-06-30&statementBalance=999000.00`
    );
    assert.equal(preview.body?.balanced, false);
    assert.equal(preview.body?.difference, "-1300.00");
    assert.equal(preview.body?.bookBalance, "1100000.00", "账面余额不得被改动来凑平");
    assert.match(String(preview.body?.message), /不会自动补平/);
  });

  await t.test("差额未确认时拒绝封存", async () => {
    const rejected = await close({
      bankAccountId: ACCOUNT_ID,
      asOf: "2026-06-30",
      statementBalance: "999000.00"
    });
    assert.equal(rejected.statusCode, 409);
    assert.equal(rejected.body?.code, "DIFFERENCE_NOT_ACKNOWLEDGED");

    const rows = await pool.query(`select 1 from bank_reconciliations where company_id = $1`, [
      COMPANY_ID
    ]);
    assert.equal(rows.rowCount, 0, "被拒的封存不得留下半条记录");
  });

  await t.test("对平时可直接封存，未达账项一并冻结", async () => {
    const closed = await close({
      bankAccountId: ACCOUNT_ID,
      asOf: "2026-06-30",
      statementBalance: "1000300.00",
      notes: "6 月对账"
    });
    assert.equal(closed.statusCode, 201, JSON.stringify(closed.body));
    assert.equal(closed.body?.balanced, true);

    const items = await pool.query<{ item_type: string; amount: string }>(
      `select item_type, amount::text from bank_reconciliation_items
       where reconciliation_id = $1 order by item_type`,
      [closed.body?.reconciliationId]
    );
    assert.equal(items.rowCount, 4, "四类未达账项各一笔，全部快照下来");
  });

  await t.test("封存后再次封存被拒", async () => {
    const again = await close({
      bankAccountId: ACCOUNT_ID,
      asOf: "2026-06-30",
      statementBalance: "1000300.00"
    });
    assert.equal(again.statusCode, 409);
    assert.equal(again.body?.code, "RECONCILIATION_CLOSED");
  });

  await t.test("封存快照不随后续流水变动而变化", async () => {
    // 封存后又来了一笔 6 月的流水
    await seedStatement(pool, { id: "st-5", amount: "-88.00", date: "2026-06-30", matchStatus: "unmatched", description: "迟到的扣费" });

    const items = await pool.query(
      `select count(*)::text as n from bank_reconciliation_items where reconciliation_id = $1`,
      [`brec-${ACCOUNT_ID}-2026-06-30`]
    );
    assert.equal(
      items.rows[0]?.n,
      "4",
      "对账结论必须连同当时的依据一起冻结，否则三个月后复查看到的不是同一份表"
    );
  });

  await t.test("多个银行账户共用同一科目时发出告警", async () => {
    await pool.query(
      `insert into bank_accounts (id, company_id, bank_name, account_no, account_name, account_code)
       values ('bank-recon-test-2', $1, '第二银行', '6222000000002', '第二户', '1002')`,
      [COMPANY_ID]
    );
    const preview = await getBalance(
      `bankAccountId=${ACCOUNT_ID}&asOf=2026-06-30&statementBalance=1000300.00`
    );
    assert.match(String(preview.body?.sharedAccountWarning), /2 个银行账户/);
    assert.match(String(preview.body?.sharedAccountWarning), /独立的明细科目/);
  });

  await t.test("历史对账结论可查", async () => {
    const { listReconciliationSessionsRoute } = await import("./reconciliation-session.routes.js");
    const capture = createResponseCapture();
    await listReconciliationSessionsRoute(
      {
        method: "GET",
        url: "/api/banking/reconciliation/sessions",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response
    );
    const listed = capture.readJson();
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.body?.total, 1);
    assert.equal(listed.body?.items[0].status, "closed");
    assert.equal(listed.body?.items[0].notes, "6 月对账");
  });
});
