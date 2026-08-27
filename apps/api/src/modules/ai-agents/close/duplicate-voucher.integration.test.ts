/**
 * 一笔业务只能有一张凭证（V16 角色实验发现的阻断缺陷）。
 *
 * ## 缺陷
 *
 * 从同一份 `event_voucher_drafts` 出发有**两条**生成凭证的路径：
 *
 * 1. `POST /api/events/:id/analyze` → `voucher-{eventId}-{type}`
 * 2. `POST /api/close/drafts/:id/approve` → `close-voucher-{draftId}`
 *
 * 两者互不知情。董事长在首页点一次「批准」，同一笔 50000 就变成
 * **两张等额凭证**，都未过账、都躺在会计的待办队列里、界面上并排显示。
 * 两张都过账就是把一笔业务记了两遍——账、报表、税，全部翻倍。
 *
 * ## 为什么此前没被发现
 *
 * 两条路径各自都有测试，各自都对。缺陷在**它们之间**：
 * 没有任何一条测试同时走过这两条路。
 *
 * 六个角色的操作实验里，董事长是唯一会点首页「批准」按钮的角色——
 * 会计从凭证中心进，走的是另一条路。**这个缺陷只有从老板的入口进才撞得到。**
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

function auth(role: string, userId: string): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId,
    username: userId.replace("usr-v4-", "v4_"),
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: [role],
    token: "test-token"
  };
}

function capture() {
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
    read<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

test("事项分析过的业务，再点「批准」不会生成第二张凭证", async (t) => {
  const { resetTestDatabase } = await import("../../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../../db/client.js");
    await closePool();
  });

  // ── 员工建事项 → 分析生成第一张凭证 ────────────────────────────────────
  const { createEvent, analyzeEvent } = await import("../../events/routes.js");

  const eventCapture = capture();
  await createEvent(
    {
      method: "POST",
      url: "/api/events",
      body: {
        type: "expense",
        title: "[夹具] 重复凭证复现",
        occurredOn: "2026-08-10",
        description: "一笔 50000 的费用",
        amount: "50000"
      },
      auth: auth("role-employee", "usr-v4-employee")
    } as ApiRequest,
    eventCapture.response
  );
  const eventId = eventCapture.read<{ id: string }>().body!.id;

  const analyzeCapture = capture();
  await analyzeEvent(
    {
      method: "POST",
      url: `/api/events/${eventId}/analyze`,
      body: {},
      auth: auth("role-employee", "usr-v4-employee")
    } as ApiRequest,
    analyzeCapture.response,
    eventId
  );
  assert.equal(analyzeCapture.read().statusCode, 200, "分析应当成功");

  const afterAnalyze = await pool.query<{ n: string }>(
    `select count(*)::text n from vouchers where business_event_id = $1`,
    [eventId]
  );
  assert.equal(afterAnalyze.rows[0]!.n, "1", "分析后应当只有一张凭证");

  // ── 老板在首页点「批准」 ───────────────────────────────────────────────
  const draft = await pool.query<{ id: string }>(
    `select id from event_voucher_drafts where business_event_id = $1 limit 1`,
    [eventId]
  );
  assert.equal(draft.rows.length, 1, "应当有一份草稿");
  const draftId = draft.rows[0]!.id;

  const { approveCloseDraft } = await import("./close-drafts.routes.js");
  const approveCapture = capture();
  await approveCloseDraft(
    {
      method: "POST",
      url: `/api/close/drafts/${draftId}/approve`,
      body: {},
      auth: auth("role-chairman", "usr-v4-chairman")
    } as ApiRequest,
    approveCapture.response,
    draftId
  );
  const approved = approveCapture.read<{ error?: string; code?: string; voucherId?: string }>();

  // ── 关键断言 ───────────────────────────────────────────────────────────
  const afterApprove = await pool.query<{ n: string }>(
    `select count(*)::text n from vouchers where business_event_id = $1`,
    [eventId]
  );
  assert.equal(
    afterApprove.rows[0]!.n,
    "1",
    "批准之后仍然只能有一张凭证——两张等额凭证都过账，这笔业务就被记了两遍"
  );

  assert.equal(approved.statusCode, 409, "重复生成应当被明确拒绝，而不是静默多建一张");
  assert.equal(approved.body!.code, "VOUCHER_ALREADY_EXISTS");
  assert.ok(
    approved.body!.voucherId,
    "错误里要带上已有凭证的 id，用户才知道该去处理哪一张"
  );
  // 错误文案要说人话：老板看不懂「唯一约束冲突」。
  assert.match(approved.body!.error!, /已经生成过凭证/);
});
