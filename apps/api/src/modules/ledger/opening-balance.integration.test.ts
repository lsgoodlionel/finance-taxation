/**
 * 期初建账的**路径级**断言（V12-B4 / 蓝图 E5）。
 *
 * 这些断言全部走 HTTP handler，而不是只测纯校验函数 —— V12 的教训正是「八条错账
 * 能存活，是因为测试只测纯函数不测路径」：借贷平衡的纯函数一直是对的，出问题的
 * 是没人在写入路径上调它。
 *
 * 覆盖：
 *   1. 期初余额真的进了总账，且被账簿读路径与资产负债表算进去
 *   2. 损益类科目 / 3131 本年利润被拒
 *   3. 借贷不平被拒 **且一行都不落库**（不自动补平）
 *   4. 科目闸门（不存在 / 汇总科目）在这条路径上同样生效
 *   5. 重复建账被拒，数据库唯一索引兜底
 *   6. 建账期间已锁账时被拒
 *   7. 撤销后可重录
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
const OPENING_DATE = "2025-12-31";

/**
 * 一家运营三年的公司迁进 FT 的典型期初：银行存款 80 万 + 应收账款 20 万，
 * 对应实收资本 70 万 + 以前年度累积的未分配利润 30 万。
 */
const OPENING_LINES = [
  { accountCode: "1002", debit: "800000.00", credit: "0.00" },
  { accountCode: "1122", debit: "200000.00", credit: "0.00" },
  { accountCode: "3001", debit: "0.00", credit: "700000.00" },
  { accountCode: "4104", debit: "0.00", credit: "300000.00" }
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

interface PostResult {
  statusCode: number;
  body: Record<string, unknown> | null;
}

async function postOpening(
  lines: readonly Record<string, unknown>[],
  openingDate = OPENING_DATE
): Promise<PostResult> {
  const { createOpeningBalancesRoute } = await import("./opening-balance.routes.js");
  const capture = createResponseCapture();
  await createOpeningBalancesRoute(
    {
      method: "POST",
      url: "/api/ledger/opening-balances",
      auth: createAuthContext(),
      body: { openingDate, lines }
    } as ApiRequest,
    capture.response
  );
  return capture.readJson<Record<string, unknown>>();
}

async function getOpening(): Promise<PostResult> {
  const { getOpeningBalancesRoute } = await import("./opening-balance.routes.js");
  const capture = createResponseCapture();
  await getOpeningBalancesRoute(
    { method: "GET", url: "/api/ledger/opening-balances", auth: createAuthContext() } as ApiRequest,
    capture.response
  );
  return capture.readJson<Record<string, unknown>>();
}

async function deleteOpening(): Promise<PostResult> {
  const { deleteOpeningBalancesRoute } = await import("./opening-balance.routes.js");
  const capture = createResponseCapture();
  await deleteOpeningBalancesRoute(
    {
      method: "DELETE",
      url: "/api/ledger/opening-balances",
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson<Record<string, unknown>>();
}

async function ledgerCounts(pool: pg.Pool): Promise<{ vouchers: number; entries: number }> {
  const vouchers = await pool.query<{ n: string }>(
    `select count(*)::text n from vouchers where company_id = $1 and source = 'opening_balance'`,
    [COMPANY_ID]
  );
  const entries = await pool.query<{ n: string }>(
    `select count(*)::text n from ledger_entries where company_id = $1 and source = 'opening_balance'`,
    [COMPANY_ID]
  );
  return { vouchers: Number(vouchers.rows[0]!.n), entries: Number(entries.rows[0]!.n) };
}

test("期初余额进总账：银行存款不再从零开始，且资产负债表恒平", async () => {
  await prepareDatabase();
  const { closePool, withTransaction } = await import("../../db/client.js");
  const { checkBalanceSheet } = await import("./balance-check.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const created = await postOpening(OPENING_LINES);
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(created.body!.totalDebit, "1000000.00");
    assert.equal(created.body!.lineCount, 4);

    // 分录落在同一张 ledger_entries 上 —— 载体选型的全部意义在此：
    // 所有既有余额读路径（`entry_date <= asOfDate`）自动把期初算进去，零改动。
    const balance = await pool.query<{ balance: string }>(
      `select sum(debit - credit)::text as balance from ledger_entries
       where company_id = $1 and account_code = '1002' and entry_date <= '2025-12-31'::date`,
      [COMPANY_ID]
    );
    assert.equal(Number(balance.rows[0]!.balance), 800000);

    // 凭证分录也写了：期初凭证是审计要翻的正式凭证，详情页不能是空的。
    const lines = await pool.query<{ n: string }>(
      `select count(*)::text n from voucher_lines where company_id = $1 and voucher_id = $2`,
      [COMPANY_ID, created.body!.voucherId]
    );
    assert.equal(lines.rows[0]!.n, "4");

    // 凭证有会计日期、期间、字号（A2/A6 的字段必须被用上，不能留空）
    const voucher = await pool.query<{
      accounting_date: string;
      period: string;
      voucher_word: string;
      voucher_seq: number;
      status: string;
    }>(
      `select accounting_date, period, voucher_word, voucher_seq, status
       from vouchers where id = $1`,
      [created.body!.voucherId]
    );
    assert.equal(voucher.rows[0]!.accounting_date, OPENING_DATE);
    assert.equal(voucher.rows[0]!.period, "2025-12");
    assert.equal(voucher.rows[0]!.voucher_word, "记");
    assert.ok(voucher.rows[0]!.voucher_seq >= 1, "期初凭证必须有连续编号");
    assert.equal(voucher.rows[0]!.status, "posted");

    const check = await withTransaction((client) =>
      checkBalanceSheet(client, COMPANY_ID, OPENING_DATE)
    );
    assert.equal(check.assets, 1000000);
    assert.equal(check.equity, 1000000);
    assert.equal(check.difference, 0, "期初建账后资产负债表必须恒平");
    assert.equal(check.residual, 0);

    const fetched = await getOpening();
    assert.equal(fetched.statusCode, 200);
    assert.equal(
      (fetched.body!.openingBalances as Record<string, unknown>).lineCount,
      4
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

test("损益类科目与 3131 本年利润不得有期初余额", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 6001 主营业务收入：损益是期间概念，跨期不结转
    const pnl = await postOpening([
      { accountCode: "1002", debit: "1000.00" },
      { accountCode: "6001", credit: "1000.00" }
    ]);
    assert.equal(pnl.statusCode, 400);
    assert.equal(pnl.body!.code, "OPENING_BALANCE_FORBIDDEN_ACCOUNT");
    assert.equal(pnl.body!.reason, "PROFIT_AND_LOSS");
    assert.deepEqual(pnl.body!.offendingCodes, ["6001"]);

    // 3131 本年利润：历史累积的未分配利润应录在 3141，不是 3131
    const currentYear = await postOpening([
      { accountCode: "1002", debit: "1000.00" },
      { accountCode: "4103", credit: "1000.00" }
    ]);
    assert.equal(currentYear.statusCode, 400);
    assert.equal(currentYear.body!.reason, "CURRENT_YEAR_PROFIT");
    assert.ok(String(currentYear.body!.error).includes("4104"));

    // 一行都不许落库
    assert.deepEqual(await ledgerCounts(pool), { vouchers: 0, entries: 0 });

    // 制造业的在产品（4001 生产成本）必须能录 —— 它的期末余额是存货，属资产。
    // 判成损益类会让制造业客户的期初资产负债表直接不平。
    const wip = await postOpening([
      { accountCode: "4001", debit: "1000.00" },
      { accountCode: "3001", credit: "1000.00" }
    ]);
    assert.equal(wip.statusCode, 201, JSON.stringify(wip.body));
  } finally {
    await closePool();
    await pool.end();
  }
});

test("借贷不平被拒绝，差额显式列出，且一行都不落库", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 漏录了 30 万未分配利润
    const result = await postOpening(OPENING_LINES.slice(0, 3));
    assert.equal(result.statusCode, 400);
    assert.equal(result.body!.code, "OPENING_BALANCE_NOT_BALANCED");
    assert.equal(result.body!.difference, "300000.00");
    // 系统绝不自动把差额塞进 3141 —— 那会把「漏录 80 万应收」和「历史未分配利润」
    // 混为一谈，账面平了但科目余额是错的。
    assert.ok(String(result.body!.error).includes("不会自动补平"));
    assert.ok(String(result.body!.error).includes("4104"));

    assert.deepEqual(
      await ledgerCounts(pool),
      { vouchers: 0, entries: 0 },
      "校验失败必须零落库，不能留下半张凭证"
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

test("科目闸门在期初路径上同样生效：不存在 / 汇总科目一律拒绝", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 041 事故的根因：编码写错也照样入库
    const unknown = await postOpening([
      { accountCode: "9999", debit: "100.00" },
      { accountCode: "3001", credit: "100.00" }
    ]);
    assert.equal(unknown.statusCode, 400);
    assert.equal(unknown.body!.code, "ACCOUNT_NOT_FOUND");

    // 042 事故的根因：往汇总科目 2221 记账，合计时被算两次
    const nonLeaf = await postOpening([
      { accountCode: "1002", debit: "100.00" },
      { accountCode: "2221", credit: "100.00" }
    ]);
    assert.equal(nonLeaf.statusCode, 400);
    assert.equal(nonLeaf.body!.code, "ACCOUNT_NOT_LEAF");

    assert.deepEqual(await ledgerCounts(pool), { vouchers: 0, entries: 0 });
  } finally {
    await closePool();
    await pool.end();
  }
});

test("重复建账被拒；数据库唯一索引兜底并发", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    assert.equal((await postOpening(OPENING_LINES)).statusCode, 201);

    const again = await postOpening(OPENING_LINES);
    assert.equal(again.statusCode, 400);
    assert.equal(again.body!.code, "OPENING_BALANCE_EXISTS");

    // 应用层「先查再插」之间的窗口在并发下会被撞穿（A8 修的红冲重复是同一类问题），
    // 所以唯一性必须同时落在数据库上。
    await assert.rejects(
      pool.query(
        `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period)
         values ('vch-opening-dup', $1, 'opening', '并发期初', 'posted', 'opening_balance', $2::date, '2025-12')`,
        [COMPANY_ID, OPENING_DATE]
      ),
      /uq_vouchers_opening_balance|duplicate key/,
      "一家公司只能有一张期初凭证，数据库必须挡住第二张"
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

test("建账期间已锁账时拒绝录入；撤销后可重录", async () => {
  await prepareDatabase();
  const { closePool } = await import("../../db/client.js");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into accounting_periods (id, company_id, period, is_locked)
       values ('per-open-lock', $1, '2025-12', true)`,
      [COMPANY_ID]
    );
    const locked = await postOpening(OPENING_LINES);
    assert.equal(locked.statusCode, 400);
    assert.equal(locked.body!.code, "PERIOD_LOCKED");

    await pool.query(
      `update accounting_periods set is_locked = false where id = 'per-open-lock'`
    );
    assert.equal((await postOpening(OPENING_LINES)).statusCode, 201);

    // 建账阶段反复调整是常态 —— 对不上上一套账的科目余额表是家常便饭，必须能撤。
    const removed = await deleteOpening();
    assert.equal(removed.statusCode, 200);
    assert.deepEqual(await ledgerCounts(pool), { vouchers: 0, entries: 0 });

    const reentered = await postOpening([
      { accountCode: "1002", debit: "500000.00" },
      { accountCode: "3001", credit: "500000.00" }
    ]);
    assert.equal(reentered.statusCode, 201);
    assert.equal(reentered.body!.totalDebit, "500000.00");

    // 锁账之后不能再撤 —— 已锁期间意味着账已经出过报表
    await pool.query(`update accounting_periods set is_locked = true where id = 'per-open-lock'`);
    const blocked = await deleteOpening();
    assert.equal(blocked.statusCode, 400);
    assert.equal(blocked.body!.code, "PERIOD_LOCKED");
  } finally {
    await closePool();
    await pool.end();
  }
});
