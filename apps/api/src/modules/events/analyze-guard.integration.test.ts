import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

/**
 * C2 问题 1 回归：`POST /api/events/:id/analyze` 曾在一个事务里无条件删除该事项的
 * `ledger_entries` / `ledger_posting_batches` / `voucher_posting_records` / `vouchers`，
 * 既不检查凭证是否已过账、也不检查期间是否锁定，且全程无审计留痕。
 *
 * 下面三个用例分别锁住：已过账 → 409 且账务原封不动；期间已锁 → 409；放行路径也留痕。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const OWNER_USER_ID = "usr-v4-accountant";
const EVENT_ID = "evt-analyze-guard-001";
const VOUCHER_ID = "vch-analyze-guard-001";
const ENTRY_PERIOD = "2026-04";
const ENTRY_DATE = `${ENTRY_PERIOD}-30`;

function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: OWNER_USER_ID,
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-accountant"],
    token: "test-token",
    ...overrides
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
      if (chunk) {
        body += chunk;
      }
      return response;
    }
  } as unknown as ServerResponse;

  return {
    response,
    readJson<T>() {
      return {
        statusCode,
        body: body ? (JSON.parse(body) as T) : null
      };
    }
  };
}

async function prepareDatabase() {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

/** 建一个「已过账」的事项：事项 → 凭证草稿 → posted 凭证 → 分录 + 过账记录。 */
async function seedPostedEvent(pool: pg.Pool, voucherStatus: "posted" | "draft"): Promise<void> {
  await pool.query(
    `insert into business_events
       (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source)
     values ($1, $2, 'purchase_expense', '闸门回归事项', '', '财务部', $3, $4::date, 1000, 'CNY', 'analyzed', 'manual')`,
    [EVENT_ID, COMPANY_ID, OWNER_USER_ID, ENTRY_DATE]
  );
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1, $2, $3, 'transfer', 'draft', '闸门回归凭证草稿')`,
    [`${VOUCHER_ID}-draft`, COMPANY_ID, EVENT_ID]
  );
  await pool.query(
    `insert into vouchers
       (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, posted_at)
     values ($1, $2, $3, $4, 'transfer', '闸门回归凭证', $5, 'analysis', now())`,
    [VOUCHER_ID, COMPANY_ID, EVENT_ID, `${VOUCHER_ID}-draft`, voucherStatus]
  );
  await pool.query(
    `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
     values ($1, $2, '闸门回归借方', '1001', '库存现金', 1000, 0, 0),
            ($3, $2, '闸门回归贷方', '6602', '管理费用', 0, 1000, 1)`,
    [`${VOUCHER_ID}-line-1`, VOUCHER_ID, `${VOUCHER_ID}-line-2`]
  );
  await pool.query(
    `insert into ledger_entries
       (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit)
     values ($1, $2, $3, $4, $5::date, '闸门回归分录', '1001', '库存现金', 1000, 0)`,
    [`${VOUCHER_ID}-entry-1`, COMPANY_ID, VOUCHER_ID, EVENT_ID, ENTRY_DATE]
  );
}

interface LedgerCounts {
  entries: number;
  vouchers: number;
}

async function countLedgerArtifacts(pool: pg.Pool): Promise<LedgerCounts> {
  const result = await pool.query<{ entries: string; vouchers: string }>(
    `select
       (select count(*)::text from ledger_entries where business_event_id = $1) as entries,
       (select count(*)::text from vouchers where business_event_id = $1) as vouchers`,
    [EVENT_ID]
  );
  return {
    entries: Number(result.rows[0]?.entries ?? 0),
    vouchers: Number(result.rows[0]?.vouchers ?? 0)
  };
}

/** writeAudit 是即发即忘的，轮询到目标动作出现为止（沿用本仓既有集成测试写法）。 */
async function waitForAuditAction(pool: pg.Pool, action: string): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await pool.query<{ n: string }>(
      `select count(*)::text as n from audit_logs
        where company_id = $1 and resource_type = 'business_event'
          and resource_id = $2 and action = $3`,
      [COMPANY_ID, EVENT_ID, action]
    );
    if (Number(result.rows[0]?.n ?? 0) > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

test("已过账的事项重新分析被 409 拒绝，已入账分录与凭证一条不少", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedPostedEvent(pool, "posted");
    const before = await countLedgerArtifacts(pool);

    const { analyzeEvent } = await import("./routes.js");
    const { closePool } = await import("../../db/client.js");
    const capture = createResponseCapture();

    await analyzeEvent(
      {
        method: "POST",
        url: `/api/events/${EVENT_ID}/analyze`,
        auth: createAuthContext(),
        body: {}
      } as ApiRequest,
      capture.response,
      EVENT_ID
    );
    const result = capture.readJson<{ error: string; code: string }>();

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.code, "EVENT_HAS_POSTED_VOUCHERS");
    assert.match(result.body?.error ?? "", /红冲/);

    const after = await countLedgerArtifacts(pool);
    assert.deepEqual(after, before, "已入账分录/凭证不得被 analyze 物理删除");
    assert.ok(after.entries > 0 && after.vouchers > 0, "夹具本身必须真的有账务数据");

    assert.ok(
      await waitForAuditAction(pool, "event.analyze.blocked"),
      "拒绝路径必须留下审计记录"
    );

    await closePool();
  } finally {
    await pool.end();
  }
});

test("分录所属期间已锁账时重新分析被 409 拒绝（按 entry_date 成期，而非当前月）", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // 凭证保持 draft，把唯一的拒绝理由留给"期间已锁"。
    await seedPostedEvent(pool, "draft");
    await pool.query(
      `insert into accounting_periods (id, company_id, period, is_locked, locked_at, locked_by)
       values ($1, $2, $3, true, now(), 'v4_chairman')`,
      [`period-analyze-guard-${ENTRY_PERIOD}`, COMPANY_ID, ENTRY_PERIOD]
    );
    const before = await countLedgerArtifacts(pool);

    const { analyzeEvent } = await import("./routes.js");
    const { closePool } = await import("../../db/client.js");
    const capture = createResponseCapture();

    await analyzeEvent(
      {
        method: "POST",
        url: `/api/events/${EVENT_ID}/analyze`,
        auth: createAuthContext(),
        body: {}
      } as ApiRequest,
      capture.response,
      EVENT_ID
    );
    const result = capture.readJson<{ error: string; code: string }>();

    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.code, "EVENT_PERIOD_LOCKED");
    assert.match(result.body?.error ?? "", new RegExp(ENTRY_PERIOD));

    assert.deepEqual(await countLedgerArtifacts(pool), before, "锁账期间的账务不得被删除");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("放行路径同样留痕：成功的重新分析写入 event.analyze 审计记录", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into business_events
         (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source)
       values ($1, $2, 'purchase_expense', '闸门回归-可分析事项', '', '财务部', $3, $4::date, 1000, 'CNY', 'submitted', 'manual')`,
      [EVENT_ID, COMPANY_ID, OWNER_USER_ID, ENTRY_DATE]
    );

    const { analyzeEvent } = await import("./routes.js");
    const { closePool } = await import("../../db/client.js");
    const capture = createResponseCapture();

    await analyzeEvent(
      {
        method: "POST",
        url: `/api/events/${EVENT_ID}/analyze`,
        auth: createAuthContext(),
        body: {}
      } as ApiRequest,
      capture.response,
      EVENT_ID
    );
    const result = capture.readJson<{ status: string }>();

    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.status, "analyzed");
    assert.ok(await waitForAuditAction(pool, "event.analyze"), "放行路径必须留下审计记录");

    await closePool();
  } finally {
    await pool.end();
  }
});
