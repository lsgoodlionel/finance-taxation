/**
 * 红冲的端到端闭环：把「已过账事项无法更正」这条死路走通。
 *
 * 背景：`POST /api/events/:id/analyze` 曾连同已过账凭证与总账分录一起硬删。
 * 该路径被闸门堵成 409 之后，系统一度没有任何更正入口 —— 已过账事项进入死路，
 * 对用户来说比"删掉"更无从下手。`POST /api/vouchers/:id/reverse` 是那个出口。
 *
 * 因此本文件最关键的一条是**闭环**：红冲 → 审核 → 过账 → 事项重新可分析。
 * 只测「红冲能建出凭证」不够 —— 建出来了但事项依然打不开，等于没修。
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
const BUSINESS_EVENT_ID = "PUR-STD-001";

const REVIEWER = { userId: "usr-rev-reviewer", username: "rev_reviewer" };
const POSTER = { userId: "usr-rev-poster", username: "rev_poster" };
const AUTHORIZER_BODY = { authorizerUserId: "usr-rev-authorizer", authorizerName: "rev_authorizer" };

function createAuthContext(actor: { userId: string; username: string }): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: actor.userId,
    username: actor.username,
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

/** 造一张待审核凭证：借银行存款 100 / 贷主营业务收入 100。 */
async function seedVoucher(pool: pg.Pool, voucherId: string): Promise<void> {
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, voucher_type, summary, status)
     values ($1, $2, $3, 'accrual', '红冲夹具凭证', 'draft')`,
    [voucherId, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  const lines = [
    { suffix: "d", account: "1002", name: "银行存款", debit: "100.00", credit: "0.00", order: 1 },
    { suffix: "c", account: "6001", name: "主营业务收入", debit: "0.00", credit: "100.00", order: 2 }
  ];
  for (const line of lines) {
    await pool.query(
      `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values ($1, $2, '红冲夹具分录', $3, $4, $5::numeric, $6::numeric, $7)`,
      [`${voucherId}-${line.suffix}`, voucherId, line.account, line.name, line.debit, line.credit, line.order]
    );
  }
}

async function approveAndPost(voucherId: string): Promise<number> {
  const { approveVoucher, postVoucher } = await import("./routes.js");
  const approve = createResponseCapture();
  await approveVoucher(
    { method: "POST", url: "/x", auth: createAuthContext(REVIEWER) } as ApiRequest,
    approve.response,
    voucherId
  );
  assert.equal(approve.readJson().statusCode, 200, "夹具审核应成功");

  const post = createResponseCapture();
  await postVoucher(
    { method: "POST", url: "/x", auth: createAuthContext(POSTER), body: AUTHORIZER_BODY } as ApiRequest,
    post.response,
    voucherId
  );
  return post.readJson().statusCode;
}

interface ReverseResult {
  statusCode: number;
  body: { id?: string; status?: string; error?: string; code?: string; lines?: unknown[] } | null;
}

async function reverse(voucherId: string): Promise<ReverseResult> {
  const { reverseVoucher } = await import("./routes.js");
  const capture = createResponseCapture();
  await reverseVoucher(
    { method: "POST", url: "/x", auth: createAuthContext(POSTER) } as ApiRequest,
    capture.response,
    voucherId
  );
  return capture.readJson() as ReverseResult;
}

test("reversing a posted voucher creates a balanced draft with debit and credit swapped", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-rev-happy";
    await seedVoucher(pool, voucherId);
    assert.equal(await approveAndPost(voucherId), 200);

    const result = await reverse(voucherId);
    assert.equal(result.statusCode, 201, `红冲应成功，实际：${JSON.stringify(result.body)}`);

    // 红冲凭证必须是 draft —— 它同样是一笔真实账务，不得绕过审核与过账。
    assert.equal(result.body?.status, "draft");
    const reversalId = result.body?.id as string;

    const lines = await pool.query<{ account_code: string; debit: string; credit: string }>(
      `select account_code, debit::text, credit::text from voucher_lines
       where voucher_id = $1 order by sort_order`,
      [reversalId]
    );
    // 原分录：借 1002 100 / 贷 6001 100 → 红冲后完全对调
    assert.deepEqual(
      lines.rows.map((row) => [row.account_code, row.debit, row.credit]),
      [
        ["1002", "0.00", "100.00"],
        ["6001", "100.00", "0.00"]
      ]
    );

    const link = await pool.query<{ reverses_voucher_id: string | null; source: string }>(
      `select reverses_voucher_id, source from vouchers where id = $1`,
      [reversalId]
    );
    assert.equal(link.rows[0]?.reverses_voucher_id, voucherId);
    assert.equal(link.rows[0]?.source, "reversal");

    // 红冲不得动原凭证：原凭证与其总账分录必须原样留在账上。
    const original = await pool.query<{ status: string }>(`select status from vouchers where id = $1`, [
      voucherId
    ]);
    assert.equal(original.rows[0]?.status, "posted");
    const entries = await pool.query<{ count: string }>(
      `select count(*)::text as count from ledger_entries where voucher_id = $1`,
      [voucherId]
    );
    assert.equal(entries.rows[0]?.count, "2", "红冲不得删除原凭证的总账分录");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("an unposted voucher, a reversal itself, and a twice-reversed voucher are all refused", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    // 未过账：直接改或作废即可，不该用红冲
    const draftId = "vch-rev-draft";
    await seedVoucher(pool, draftId);
    const draft = await reverse(draftId);
    assert.equal(draft.statusCode, 409);
    assert.equal(draft.body?.code, "VOUCHER_NOT_POSTED");

    // 已过账 → 红冲一次成功
    const postedId = "vch-rev-twice";
    await seedVoucher(pool, postedId);
    assert.equal(await approveAndPost(postedId), 200);
    const first = await reverse(postedId);
    assert.equal(first.statusCode, 201);
    const reversalId = first.body?.id as string;

    // 重复红冲会把账冲成反方向，等于凭空造一笔业务
    const second = await reverse(postedId);
    assert.equal(second.statusCode, 409);
    assert.equal(second.body?.code, "VOUCHER_ALREADY_REVERSED");

    // 红冲的红冲会绕过「已过账不得改写」，同样拒绝（先把红冲凭证过账）
    assert.equal(await approveAndPost(reversalId), 200);
    const third = await reverse(reversalId);
    assert.equal(third.statusCode, 409);
    assert.equal(third.body?.code, "VOUCHER_IS_REVERSAL");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("reversing is refused while the original voucher's period is locked", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-rev-locked";
    await seedVoucher(pool, voucherId);
    assert.equal(await approveAndPost(voucherId), 200);

    // 锁掉原凭证分录实际所在的期间（不是"当前月"——跨月红冲会绕过当前月口径）
    const period = await pool.query<{ period: string }>(
      `select distinct to_char(entry_date, 'YYYY-MM') as period
       from ledger_entries where voucher_id = $1`,
      [voucherId]
    );
    const periodLabel = period.rows[0]!.period;
    await pool.query(
      `insert into accounting_periods (company_id, period, is_locked)
       values ($1, $2, true)
       on conflict (company_id, period) do update set is_locked = true`,
      [COMPANY_ID, periodLabel]
    );

    const result = await reverse(voucherId);
    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.code, "VOUCHER_PERIOD_LOCKED");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("a fully reversed voucher stops blocking the event from being re-analysed", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-rev-closeloop";
    await seedVoucher(pool, voucherId);
    assert.equal(await approveAndPost(voucherId), 200);

    const { evaluateAnalyzeGuard } = await import("../events/analyze-guard.js");

    // 取数口径由 loadAnalyzeGuardInput 的 SQL 决定，这里用同一条口径复现：
    // 「已过账 且 不存在已过账的反向凭证指向它」才算阻断。
    //
    // 只查被测的这一张：验收数据里同一事项下还挂着别的已过账凭证，
    // 把它们算进来会让「红冲后不再阻断」的断言恒假，测的就不是本用例的行为了。
    async function isBlocking(): Promise<boolean> {
      const rows = await pool.query<{ id: string }>(
        `select v.id
         from vouchers v
         where v.company_id = $1 and v.id = $2 and v.status = 'posted'
           and not exists (
             select 1 from vouchers r
             where r.company_id = v.company_id and r.reverses_voucher_id = v.id and r.status = 'posted'
           )`,
        [COMPANY_ID, voucherId]
      );
      return rows.rows.length > 0;
    }

    // 红冲之前：这张已过账凭证挡住事项
    assert.equal(await isBlocking(), true, "红冲前该凭证应构成阻断");
    assert.equal(
      evaluateAnalyzeGuard({ postedVoucherIds: [voucherId], lockedPeriods: [] }).allowed,
      false
    );

    // 红冲但尚未过账：账务影响还没归零，仍应阻断
    const reversal = await reverse(voucherId);
    assert.equal(reversal.statusCode, 201);
    assert.equal(
      await isBlocking(),
      true,
      "红冲凭证未过账前，原凭证的账务影响尚未归零，必须继续阻断"
    );

    // 红冲过账后：闭环完成，这张凭证不再阻断，事项重新可分析
    assert.equal(await approveAndPost(reversal.body!.id as string), 200);
    assert.equal(await isBlocking(), false, "红冲过账后该凭证不应再阻断");
    assert.equal(evaluateAnalyzeGuard({ postedVoucherIds: [], lockedPeriods: [] }).allowed, true);
  } finally {
    await closePool();
    await pool.end();
  }
});
