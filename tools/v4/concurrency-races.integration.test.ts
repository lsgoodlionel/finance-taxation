import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import pg from "pg";
import { resetTestDatabase } from "./reset-test-db.js";

/**
 * V7 Stage M 并发竞态回归（真实 PG，Promise.all 双请求复现 Playwright
 * desktop/tablet 双 project 并行实测触发过的两个 500）：
 *
 * 1. POST /api/events —— 旧 id `evt-${Date.now()}` 同毫秒并发撞主键；
 *    修复后（时间戳+随机段）并发创建必须全部成功且 id 互异。
 * 2. POST /api/close/drafts/generate —— findEligibleEvents 与固定 id
 *    `close-draft-${eventId}` 的插入非原子，同属期并发撞主键；
 *    修复后（on conflict do nothing）双请求都 200，草稿每事项恰一条，
 *    generated/skipped 计数与实际落库对齐。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const admin = new pg.Pool({ connectionString: databaseUrl });
const COMPANY = "cmp-race";
const USER = "usr-race";
const PERIOD = "2026-06";
let reachable = false;

type EventsMod = typeof import("../../apps/api/src/modules/events/routes.js");
type DraftsMod = typeof import("../../apps/api/src/modules/ai-agents/close/close-drafts.routes.js");
let events: EventsMod;
let drafts: DraftsMod;

interface Captured {
  status: number;
  body: unknown;
}

function fakeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, body: null };
  const res = {
    writeHead(code: number) {
      captured.status = code;
      return res;
    },
    end(chunk?: string) {
      if (chunk) captured.body = JSON.parse(chunk);
      return res;
    }
  } as unknown as ServerResponse;
  return { res, captured };
}

function fakeReq(body: unknown): any {
  return {
    method: "POST",
    url: "/",
    headers: {},
    body,
    auth: { companyId: COMPANY, userId: USER, username: "race", roleCodes: [] }
  };
}

before(async () => {
  try {
    await admin.query("select 1");
    reachable = true;
  } catch {
    reachable = false;
    return;
  }
  await resetTestDatabase(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  events = await import("../../apps/api/src/modules/events/routes.js");
  drafts = await import("../../apps/api/src/modules/ai-agents/close/close-drafts.routes.js");
  await admin.query("insert into companies (id, name) values ($1, '并发竞态测试') on conflict do nothing", [COMPANY]);
  await admin.query(
    `insert into users (id, company_id, username, display_name)
     values ($1, $2, 'race', '并发测试员') on conflict do nothing`,
    [USER, COMPANY]
  );
});

after(async () => {
  const auditMod = await import("../../apps/api/src/services/audit.js").catch(() => null);
  if (auditMod) await auditMod.drainAuditQueues();
  const clientMod = await import("../../apps/api/src/db/client.js").catch(() => null);
  if (clientMod) await clientMod.closePool();
  await admin.end();
});

test("并发 createEvent：同毫秒双请求全部成功且 id 互异（不撞主键 500）", async (t) => {
  if (!reachable) {
    t.skip(`skipped: cannot reach ${databaseUrl}`);
    return;
  }
  const CONCURRENCY = 5;
  const body = {
    type: "expense",
    title: "并发差旅报销",
    description: "双 project 并行触发",
    department: "财务部",
    // 注意：避开 PERIOD（2026-06），否则这些事项会混入下方 close drafts 测试的候选集
    occurredOn: "2026-05-10",
    amount: "100.00",
    currency: "CNY",
    source: "manual"
  };

  const captures = Array.from({ length: CONCURRENCY }, () => fakeRes());
  await Promise.all(captures.map(({ res }) => events.createEvent(fakeReq(body), res)));

  const ids = captures.map(({ captured }) => {
    assert.equal(captured.status, 201, `并发创建应全部成功，实际 ${captured.status}: ${JSON.stringify(captured.body)}`);
    const id = (captured.body as { id?: string }).id;
    assert.ok(id && id.startsWith("evt-"), "id 保持 evt- 前缀形态");
    return id!;
  });
  assert.equal(new Set(ids).size, CONCURRENCY, "并发创建的事项 id 必须互异");

  const rows = await admin.query<{ n: number }>(
    "select count(*)::int n from business_events where company_id=$1 and title='并发差旅报销'",
    [COMPANY]
  );
  assert.equal(rows.rows[0]?.n, CONCURRENCY, "每个请求各落库一条事项");
});

test("并发 generateCloseDrafts：同属期双请求都 200，草稿每事项恰一条且计数对齐", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await admin.query(
    `insert into business_events (id, company_id, type, title, amount, occurred_on, status)
     values ('be-race-1', $1, 'expense', '并发月结事项一', 800, '2026-06-05', 'draft'),
            ('be-race-2', $1, 'expense', '并发月结事项二', 1200, '2026-06-20', 'draft')`,
    [COMPANY]
  );
  const EVENT_COUNT = 2;

  const first = fakeRes();
  const second = fakeRes();
  await Promise.all([
    drafts.generateCloseDrafts(fakeReq({ period: PERIOD }), first.res),
    drafts.generateCloseDrafts(fakeReq({ period: PERIOD }), second.res)
  ]);

  interface GenerateBody {
    generated: number;
    skipped: number;
    drafts: Array<{ draftId: string }>;
  }
  const bodies = [first, second].map(({ captured }) => {
    assert.equal(captured.status, 200, `并发 generate 应都成功，实际 ${captured.status}: ${JSON.stringify(captured.body)}`);
    return captured.body as GenerateBody;
  });

  for (const body of bodies) {
    assert.equal(body.generated + body.skipped, EVENT_COUNT, "每个响应 generated+skipped 必须覆盖全部候选事项");
    assert.equal(body.generated, body.drafts.length, "generated 计数与返回的草稿明细一致");
  }
  const totalGenerated = bodies[0]!.generated + bodies[1]!.generated;
  assert.equal(totalGenerated, EVENT_COUNT, "两请求合计恰好各事项生成一次（冲突方计入 skipped）");

  const draftRows = await admin.query<{ business_event_id: string; n: number }>(
    `select business_event_id, count(*)::int n
     from event_voucher_drafts where company_id=$1 group by business_event_id`,
    [COMPANY]
  );
  assert.equal(draftRows.rows.length, EVENT_COUNT, "每个事项恰好一条草稿");
  for (const row of draftRows.rows) {
    assert.equal(row.n, 1, `事项 ${row.business_event_id} 不得出现重复草稿`);
  }

  const lineRows = await admin.query<{ draft_id: string; n: number }>(
    `select l.draft_id, count(*)::int n
     from voucher_draft_lines l
     join event_voucher_drafts d on d.id = l.draft_id
     where d.company_id=$1 group by l.draft_id`,
    [COMPANY]
  );
  assert.equal(lineRows.rows.length, EVENT_COUNT, "每条草稿都有分录行（冲突落空方不留孤儿行）");
  for (const row of lineRows.rows) {
    assert.ok(row.n >= 2, `草稿 ${row.draft_id} 应含借贷两侧分录`);
  }

  // 幂等收尾：草稿齐备后再 generate 一次应全部 skipped
  const third = fakeRes();
  await drafts.generateCloseDrafts(fakeReq({ period: PERIOD }), third.res);
  assert.equal(third.captured.status, 200);
  const thirdBody = third.captured.body as GenerateBody;
  assert.equal(thirdBody.generated, 0);
  assert.equal(thirdBody.skipped, EVENT_COUNT);
});
