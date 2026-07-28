/**
 * 凭证过账的职责分离回归。
 *
 * 起因：`POST /api/vouchers/:id/post` 曾对**任何**调用恒返回 400
 * `WORKFLOW_DUTY_CONFLICT` —— 职责分离校验把 reviewerUserId 与 posterUserId
 * 都传成当前登录用户，而规则判定「两者相同即冲突」。过账功能实际完全不可用，
 * 却没有任何测试发现：`modules/vouchers/` 下此前没有路由级测试，E2E 也不碰过账。
 *
 * 根因是 vouchers 表没存审核人（只有 approved_at），代码无从取真实复核人。
 * 迁移 043 补上 `approved_by_user_id`，审核时写入，过账时据此判定。
 *
 * 本文件按「谁审的、谁过的、谁终审的」三个角色的组合逐一钉死行为，
 * 并验证过账确实落了总账 —— 只断言 200 会漏掉「放行了但没记账」。
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
const OTHER_COMPANY_ID = "cmp-v4-service";
const BUSINESS_EVENT_ID = "PUR-STD-001";

const REVIEWER = { userId: "usr-post-reviewer", username: "post_reviewer" };
const POSTER = { userId: "usr-post-poster", username: "post_poster" };
const AUTHORIZER = { userId: "usr-post-authorizer", username: "post_authorizer" };

function createAuthContext(actor: { userId: string; username: string }, companyId = COMPANY_ID): AuthContext {
  return {
    companyId,
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

interface VoucherFixture {
  id: string;
  /** 借贷是否配平；不配平用于验证「过账前先校验借贷」这道更靠前的闸。 */
  balanced?: boolean;
  companyId?: string;
}

/**
 * 造一张待审核凭证。金额固定 100，两条分录一借一贷。
 * balanced=false 时贷方少 40，用来打「借贷不平不得过账」这条断言。
 */
async function seedVoucher(pool: pg.Pool, fixture: VoucherFixture): Promise<void> {
  const companyId = fixture.companyId ?? COMPANY_ID;
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, voucher_type, summary, status)
     values ($1, $2, $3, 'accrual', '过账职责分离夹具', 'draft')`,
    [fixture.id, companyId, companyId === COMPANY_ID ? BUSINESS_EVENT_ID : null]
  );
  const creditAmount = fixture.balanced === false ? "60.00" : "100.00";
  const lines = [
    { suffix: "d", account: "1002", name: "银行存款", debit: "100.00", credit: "0.00", order: 1 },
    { suffix: "c", account: "6001", name: "主营业务收入", debit: "0.00", credit: creditAmount, order: 2 }
  ];
  for (const line of lines) {
    await pool.query(
      `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values ($1, $2, '过账夹具分录', $3, $4, $5::numeric, $6::numeric, $7)`,
      [`${fixture.id}-${line.suffix}`, fixture.id, line.account, line.name, line.debit, line.credit, line.order]
    );
  }
}

async function approveAs(
  voucherId: string,
  actor: { userId: string; username: string },
  companyId = COMPANY_ID
): Promise<number> {
  const { approveVoucher } = await import("./routes.js");
  const capture = createResponseCapture();
  await approveVoucher(
    { method: "POST", url: `/api/vouchers/${voucherId}/approve`, auth: createAuthContext(actor, companyId) } as ApiRequest,
    capture.response,
    voucherId
  );
  return capture.readJson().statusCode;
}

interface PostResult {
  statusCode: number;
  body: { error?: string; code?: string; status?: string; ledgerEntries?: unknown[] } | null;
}

async function postAs(
  voucherId: string,
  actor: { userId: string; username: string },
  body: Record<string, unknown> | undefined,
  companyId = COMPANY_ID
): Promise<PostResult> {
  const { postVoucher } = await import("./routes.js");
  const capture = createResponseCapture();
  await postVoucher(
    {
      method: "POST",
      url: `/api/vouchers/${voucherId}/post`,
      auth: createAuthContext(actor, companyId),
      body
    } as ApiRequest,
    capture.response,
    voucherId
  );
  return capture.readJson() as PostResult;
}

const authorizedBody = { authorizerUserId: AUTHORIZER.userId, authorizerName: AUTHORIZER.username };

test("posting a voucher succeeds when reviewer, poster and authorizer are three different users", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-post-happy";
    await seedVoucher(pool, { id: voucherId });

    assert.equal(await approveAs(voucherId, REVIEWER), 200);

    // 审核必须把审核人落库 —— 这是整条职责分离链的数据基础。
    const approved = await pool.query<{ approved_by_user_id: string | null }>(
      `select approved_by_user_id from vouchers where id = $1`,
      [voucherId]
    );
    assert.equal(approved.rows[0]?.approved_by_user_id, REVIEWER.userId);

    const result = await postAs(voucherId, POSTER, authorizedBody);
    assert.equal(result.statusCode, 200, `过账应成功，实际：${JSON.stringify(result.body)}`);
    assert.equal(result.body?.status, "posted");

    // 只断言 200 不够：放行了但没记账同样是坏的。
    const entries = await pool.query<{ count: string }>(
      `select count(*)::text as count from ledger_entries where voucher_id = $1 and company_id = $2`,
      [voucherId, COMPANY_ID]
    );
    assert.equal(entries.rows[0]?.count, "2");
    const records = await pool.query<{ posted_by_user_id: string }>(
      `select posted_by_user_id from voucher_posting_records where voucher_id = $1`,
      [voucherId]
    );
    assert.equal(records.rows[0]?.posted_by_user_id, POSTER.userId);
  } finally {
    await closePool();
    await pool.end();
  }
});

test("posting rejects self-review: the same user cannot both approve and post", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-post-self-review";
    await seedVoucher(pool, { id: voucherId });
    assert.equal(await approveAs(voucherId, REVIEWER), 200);

    const result = await postAs(voucherId, REVIEWER, authorizedBody);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.code, "WORKFLOW_DUTY_CONFLICT");
    assert.match(String(result.body?.error), /reviewer and poster/);

    const entries = await pool.query<{ count: string }>(
      `select count(*)::text as count from ledger_entries where voucher_id = $1`,
      [voucherId]
    );
    assert.equal(entries.rows[0]?.count, "0", "被拒的过账不得留下任何总账分录");
  } finally {
    await closePool();
    await pool.end();
  }
});

test("posting requires a final authorizer, and the authorizer cannot be the poster", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-post-authorizer";
    await seedVoucher(pool, { id: voucherId });
    assert.equal(await approveAs(voucherId, REVIEWER), 200);

    // 不传终审人：应报「缺终审人」，而不是含糊的职责冲突。
    const missing = await postAs(voucherId, POSTER, {});
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.body?.code, "WORKFLOW_AUTHORIZATION_REQUIRED");

    // 拿自己当终审人：不构成第三方复核，必须拒。
    const self = await postAs(voucherId, POSTER, {
      authorizerUserId: POSTER.userId,
      authorizerName: POSTER.username
    });
    assert.equal(self.statusCode, 400);
    assert.equal(self.body?.code, "WORKFLOW_DUTY_CONFLICT");
    assert.match(String(self.body?.error), /executor and authorizer/);
  } finally {
    await closePool();
    await pool.end();
  }
});

test("vouchers approved before migration 043 keep no approver and stay postable", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-post-legacy";
    await seedVoucher(pool, { id: voucherId });
    // 模拟 043 之前的存量数据：有审核时间，无审核人。
    await pool.query(
      `update vouchers set status = 'review_required', approved_at = now(), approved_by_user_id = null where id = $1`,
      [voucherId]
    );

    const result = await postAs(voucherId, POSTER, authorizedBody);
    assert.equal(
      result.statusCode,
      200,
      `存量凭证无审核人记录时应放行职责分离检查，否则永远过不了账；实际：${JSON.stringify(result.body)}`
    );
  } finally {
    await closePool();
    await pool.end();
  }
});

test("posting refuses unapproved and unbalanced vouchers before the authorization check", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const unapprovedId = "vch-post-unapproved";
    await seedVoucher(pool, { id: unapprovedId });
    const unapproved = await postAs(unapprovedId, POSTER, authorizedBody);
    assert.equal(unapproved.statusCode, 400);
    assert.match(String(unapproved.body?.error), /approved before posting/);

    const unbalancedId = "vch-post-unbalanced";
    await seedVoucher(pool, { id: unbalancedId, balanced: false });
    assert.equal(await approveAs(unbalancedId, REVIEWER), 200);
    const unbalanced = await postAs(unbalancedId, POSTER, authorizedBody);
    assert.equal(unbalanced.statusCode, 400);
    assert.match(String(unbalanced.body?.error), /not balanced/);
  } finally {
    await closePool();
    await pool.end();
  }
});

test("the approver lookup is company-scoped: another tenant's voucher is not found", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const { closePool } = await import("../../db/client.js");
  try {
    const voucherId = "vch-post-cross-tenant";
    await seedVoucher(pool, { id: voucherId, companyId: OTHER_COMPANY_ID });
    await pool.query(`update vouchers set status = 'review_required', approved_at = now() where id = $1`, [
      voucherId
    ]);

    const result = await postAs(voucherId, POSTER, authorizedBody, COMPANY_ID);
    assert.equal(result.statusCode, 404, "跨租户凭证必须查无此单，不能因审核人查询而泄露存在性");
  } finally {
    await closePool();
    await pool.end();
  }
});
