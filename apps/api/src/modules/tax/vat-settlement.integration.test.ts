/**
 * V12-B8：增值税科目链条补全 + 月末结转未交增值税（蓝图 F4）。
 *
 * 迁移 060 之前，2221 下只有销项/进项两个增值税科目，「结转未交增值税」这一步
 * **无科目可用**。本文件钉死两件事：
 *
 *   1. 科目链条对**新老公司**都在（老公司靠迁移末尾补 seed，新公司靠 049 的触发器）；
 *   2. 三种轧差情形各自的落库结果 —— 应缴出凭证、留抵不出、轧平不出；
 *      且出的凭证必须是 **draft**、**不写总账**。
 *
 * 第 2 条里「留抵不出凭证」是最容易被后来者"顺手补上"的一条：把留抵转进
 * 「未交增值税」的借方，等于在账上凭空造出一笔应收税款。留抵只是下期能少缴，
 * 税务机关不会退（留抵退税是另一项单独申请的业务）。
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
const PERIOD = "2026-06";
const PERIOD_END = "2026-06-30";
const SETTLEMENT_VOUCHER_ID = `vch-vat-${COMPANY_ID}-${PERIOD}`;

/** 迁移 060 新增的科目：编码 → account_type。account_type 才是结转逻辑的取数依据。 */
const NEW_VAT_ACCOUNTS: ReadonlyArray<readonly [string, string]> = [
  ["222107", "liability_tax_vat_input_transfer_out"],
  ["222108", "liability_tax_vat_paid"],
  ["222109", "liability_tax_vat_transfer_unpaid"],
  ["222110", "liability_tax_vat_transfer_overpaid"],
  ["222111", "liability_tax_vat_unpaid"],
  ["222112", "liability_tax_vat_prepaid"],
  ["222113", "liability_tax_vat_pending_certification"],
  ["222114", "liability_tax_vat_deferred_input"],
  ["222115", "liability_tax_vat_simplified"]
];

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
    writeHead(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return response;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
      return response;
    }
  } as unknown as ServerResponse;

  return {
    response,
    readJson<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

interface VatEntry {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

const FIXTURE_VOUCHER_ID = "vch-vat-fixture";

/**
 * 造一批已过账的增值税分录。整批一次性写入并保持借贷平衡 —— 结转取数只看
 * `ledger_entries`，凭证本身只是分录的载体。
 */
async function seedVatLedger(
  pool: pg.Pool,
  taxpayerType: string,
  entries: readonly VatEntry[],
  entryDate = "2026-06-15"
): Promise<void> {
  await pool.query(
    `insert into taxpayer_profiles (id, company_id, taxpayer_type, effective_from, status, notes)
     values ('tp-v4-vat', $1, $2, '2026-01-01', 'active', 'B8 结转测试夹具')
     on conflict (id) do update set taxpayer_type = excluded.taxpayer_type`,
    [COMPANY_ID, taxpayerType]
  );
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, accounting_date, posted_at)
     values ($1, $2, 'accrual', '增值税结转夹具凭证', 'posted', $3::date, now())
     on conflict (id) do nothing`,
    [FIXTURE_VOUCHER_ID, COMPANY_ID, entryDate]
  );
  for (const [index, entry] of entries.entries()) {
    await pool.query(
      `insert into ledger_entries (
         id, company_id, voucher_id, entry_date, summary,
         account_code, account_name, debit, credit, source, posted_at
       ) values ($1, $2, $3, $4::date, '增值税夹具', $5, $6, $7::numeric, $8::numeric,
                 'voucher_posting', now())`,
      [
        `led-vat-fixture-${index + 1}`,
        COMPANY_ID,
        FIXTURE_VOUCHER_ID,
        entryDate,
        entry.accountCode,
        entry.accountName,
        entry.debit,
        entry.credit
      ]
    );
  }
}

const OUTPUT = (amount: string): VatEntry => ({
  accountCode: "222101",
  accountName: "应交税费-应交增值税（销项）",
  debit: "0.00",
  credit: amount
});
const INPUT = (amount: string): VatEntry => ({
  accountCode: "222102",
  accountName: "应交税费-应交增值税（进项）",
  debit: amount,
  credit: "0.00"
});
/**
 * 对手方，只为让整批分录借贷平衡，不参与增值税轧差。
 *
 * 借贷分两个 helper 而不是一个双侧参数：迁移 047 的
 * `ledger_entries_single_side_check` 不允许同一行既有借又有贷。
 */
const BANK_DEBIT = (amount: string): VatEntry => ({
  accountCode: "1002",
  accountName: "银行存款",
  debit: amount,
  credit: "0.00"
});
const BANK_CREDIT = (amount: string): VatEntry => ({
  accountCode: "1002",
  accountName: "银行存款",
  debit: "0.00",
  credit: amount
});

interface SettlementResponse {
  outcome: string;
  payableAmount: string;
  creditCarriedForward: string;
  voucherId: string | null;
  reason: string;
}

async function callCreate(): Promise<{ statusCode: number; body: SettlementResponse | null }> {
  const { createVatSettlementVoucher } = await import("./vat-settlement.routes.js");
  const capture = createResponseCapture();
  const req = {
    url: "/api/tax/vat-settlement",
    method: "POST",
    body: { period: PERIOD },
    auth: createAuthContext()
  } as unknown as ApiRequest;
  await createVatSettlementVoucher(req, capture.response);
  return capture.readJson<SettlementResponse>();
}

interface PreviewResponse extends SettlementResponse {
  existingVoucherId: string | null;
  existingVoucherStatus: string | null;
}

async function callPreview(
  period = PERIOD
): Promise<{ statusCode: number; body: PreviewResponse | null }> {
  const { previewVatSettlement } = await import("./vat-settlement.routes.js");
  const capture = createResponseCapture();
  const req = {
    url: `/api/tax/vat-settlement?period=${period}`,
    method: "GET",
    auth: createAuthContext()
  } as unknown as ApiRequest;
  await previewVatSettlement(req, capture.response);
  return capture.readJson<PreviewResponse>();
}

async function countSettlementVouchers(pool: pg.Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from vouchers where company_id = $1 and source = 'vat_settlement'`,
    [COMPANY_ID]
  );
  return Number(result.rows[0]?.count ?? "0");
}

// ── 科目链条 ────────────────────────────────────────────────────────

test("the VAT account chain is seeded for companies that already existed", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    for (const [code, accountType] of NEW_VAT_ACCOUNTS) {
      const row = await pool.query<{ account_type: string; is_leaf: boolean; parent_code: string }>(
        `select account_type, is_leaf, parent_code from accounts where company_id = $1 and code = $2`,
        [COMPANY_ID, code]
      );
      assert.equal(row.rowCount, 1, `既有公司缺少增值税科目 ${code}`);
      assert.equal(row.rows[0]?.account_type, accountType);
      assert.equal(row.rows[0]?.is_leaf, true, "增值税明细科目必须是叶子，否则记账会被科目闸门拒绝");
      assert.equal(row.rows[0]?.parent_code, "2221");
    }

    // 既有的销项/进项要拿到语义标签，否则结转逻辑取不到它们
    const output = await pool.query<{ account_type: string }>(
      `select account_type from accounts where company_id = $1 and code = '222101'`,
      [COMPANY_ID]
    );
    assert.equal(output.rows[0]?.account_type, "liability_tax_vat_output");
    const input = await pool.query<{ account_type: string }>(
      `select account_type from accounts where company_id = $1 and code = '222102'`,
      [COMPANY_ID]
    );
    assert.equal(input.rows[0]?.account_type, "liability_tax_vat_input");
  } finally {
    await pool.end();
  }
});

test("a newly created company gets the VAT account chain from the template", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 049 的触发器在建公司时自动 seed —— 补科目必须补进模板，否则只有老公司有
    await pool.query(
      `insert into companies (id, name, status) values ('cmp-b8-new', 'B8 新建公司', 'active')`
    );
    const codes = NEW_VAT_ACCOUNTS.map(([code]) => code);
    const rows = await pool.query<{ code: string }>(
      `select code from accounts where company_id = 'cmp-b8-new' and code = any($1::text[])`,
      [codes]
    );
    assert.equal(rows.rowCount, codes.length, "新建公司应从模板拿到全部增值税科目");
  } finally {
    await pool.end();
  }
});

// ── 情形一：销项 > 进项 → 生成 draft 凭证 ─────────────────────────────

test("output above input produces a DRAFT settlement voucher and never touches the ledger", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedVatLedger(pool, "general_vat", [
      OUTPUT("1300.00"),
      INPUT("300.00"),
      BANK_DEBIT("1000.00")
    ]);

    // 预览与生成必须给出同一个数，且预览一行都不落库
    const preview = await callPreview();
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.body?.outcome, "payable");
    assert.equal(preview.body?.payableAmount, "1000.00");
    assert.equal(preview.body?.existingVoucherId, null);
    assert.equal(await countSettlementVouchers(pool), 0, "预览不得落库");

    const { statusCode, body } = await callCreate();
    assert.equal(statusCode, 201, `期望 201，实际 ${statusCode}：${JSON.stringify(body)}`);
    assert.equal(body?.outcome, "payable");
    assert.equal(body?.payableAmount, "1000.00");
    assert.equal(body?.voucherId, SETTLEMENT_VOUCHER_ID);

    const voucher = await pool.query<{ status: string; source: string; accounting_date: string }>(
      `select status, source, accounting_date::text from vouchers where id = $1`,
      [SETTLEMENT_VOUCHER_ID]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "系统生成的凭证不得自动过账 —— 会绕过职责分离复核");
    assert.equal(voucher.rows[0]?.source, "vat_settlement");
    assert.equal(voucher.rows[0]?.accounting_date, PERIOD_END, "会计日期应落在被结转的期间内");

    const lines = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit::text, credit::text from voucher_lines
       where voucher_id = $1 order by sort_order asc`,
      [SETTLEMENT_VOUCHER_ID]
    );
    assert.deepEqual(
      lines.rows,
      [
        { account_code: "222109", debit: "1000.00", credit: "0.00" },
        { account_code: "222111", debit: "0.00", credit: "1000.00" }
      ],
      "标准分录：借 应交增值税（转出未交增值税） / 贷 未交增值税"
    );

    const ledger = await pool.query<{ count: string }>(
      `select count(*)::text as count from ledger_entries where voucher_id = $1`,
      [SETTLEMENT_VOUCHER_ID]
    );
    assert.equal(ledger.rows[0]?.count, "0", "草稿不得写总账，分录只能在过账时由 ledger-writer 产生");

    // 幂等：同一期间不得重复结转
    const again = await callCreate();
    assert.equal(again.statusCode, 409);
    assert.equal(await countSettlementVouchers(pool), 1);

    // 已生成之后预览要能指回那张凭证，而不是让用户以为还没做
    const afterPreview = await callPreview();
    assert.equal(afterPreview.body?.existingVoucherId, SETTLEMENT_VOUCHER_ID);
    assert.equal(afterPreview.body?.existingVoucherStatus, "draft");
  } finally {
    await pool.end();
  }
});

// ── 情形二：进项 > 销项 → 留抵，不结转 ────────────────────────────────

test("input above output carries the credit forward without creating any voucher", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedVatLedger(pool, "general_vat", [
      OUTPUT("100.00"),
      INPUT("300.00"),
      BANK_CREDIT("200.00")
    ]);

    const { statusCode, body } = await callCreate();
    assert.equal(statusCode, 200, "什么都不用做本身就是正确结果，不该报错");
    assert.equal(body?.outcome, "credit_carried");
    assert.equal(body?.creditCarriedForward, "200.00");
    assert.equal(body?.voucherId, null);
    assert.equal(await countSettlementVouchers(pool), 0, "留抵税额继续留在进项科目，下月接着抵");
  } finally {
    await pool.end();
  }
});

// ── 情形三：相等 → 不产生凭证 ────────────────────────────────────────

test("equal output and input produce no voucher at all", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedVatLedger(pool, "general_vat", [
      OUTPUT("500.00"),
      INPUT("500.00")
    ]);

    const { statusCode, body } = await callCreate();
    assert.equal(statusCode, 200);
    assert.equal(body?.outcome, "balanced");
    assert.equal(await countSettlementVouchers(pool), 0);
  } finally {
    await pool.end();
  }
});

// ── 纳税人身份 ──────────────────────────────────────────────────────

test("small-scale taxpayers get an explicit not-applicable answer, not a voucher", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedVatLedger(pool, "small_scale", [OUTPUT("1300.00"), BANK_DEBIT("1300.00")]);

    const { statusCode, body } = await callCreate();
    assert.equal(statusCode, 200);
    assert.equal(body?.outcome, "not_applicable");
    assert.match(body?.reason ?? "", /小规模纳税人/);
    assert.equal(await countSettlementVouchers(pool), 0);
  } finally {
    await pool.end();
  }
});

// ── 期间锁 ──────────────────────────────────────────────────────────

test("a locked period refuses to produce a settlement draft", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedVatLedger(pool, "general_vat", [
      OUTPUT("1300.00"),
      INPUT("300.00"),
      BANK_DEBIT("1000.00")
    ]);
    await pool.query(
      `insert into accounting_periods (id, company_id, period, is_locked)
       values ('ap-b8-lock', $1, $2, true)
       on conflict (company_id, period) do update set is_locked = true`,
      [COMPANY_ID, PERIOD]
    );

    const { statusCode } = await callCreate();
    assert.equal(statusCode, 409, "已锁账的期间不该还能生成结转草稿");
    assert.equal(await countSettlementVouchers(pool), 0);
  } finally {
    await pool.end();
  }
});
