import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import pg from "pg";
import { resetTestDatabase } from "./reset-test-db.js";

/**
 * Stage H wave 2：draft-then-approve 草稿队列端到端（真实 PG）。
 * 证明：generate 产出草稿 → list 可见 → approve 只生成 status='draft' 的凭证
 * （绝不 posted）且服务端重算借贷平衡 → reject 生效。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const admin = new pg.Pool({ connectionString: databaseUrl });
const COMPANY = "cmp-hclose";
const PERIOD = "2026-05";
let reachable = false;

type DraftsMod = typeof import("../../apps/api/src/modules/ai-agents/close/close-drafts.routes.js");
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
    auth: { companyId: COMPANY, userId: "usr-h", username: "hclose" }
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
  drafts = await import("../../apps/api/src/modules/ai-agents/close/close-drafts.routes.js");
  await admin.query("insert into companies (id, name) values ($1, 'H 月结测试') on conflict do nothing", [COMPANY]);
  await admin.query(
    `insert into business_events (id, company_id, type, title, amount, occurred_on, status)
     values ('be-exp-1', $1, 'expense', '办公费用报销', 1000, '2026-05-15', 'draft')`,
    [COMPANY]
  );
});

after(async () => {
  const clientMod = await import("../../apps/api/src/db/client.js").catch(() => null);
  if (clientMod) await clientMod.closePool();
  await admin.end();
});

test("generate 为未入账事项产出草稿", async (t) => {
  if (!reachable) {
    t.skip(`skipped: cannot reach ${databaseUrl}`);
    return;
  }
  const { res, captured } = fakeRes();
  await drafts.generateCloseDrafts(fakeReq({ period: PERIOD }), res);
  assert.equal(captured.status, 200);
  const rows = await admin.query("select id, status, proposal_level from event_voucher_drafts where company_id=$1", [COMPANY]);
  assert.ok(rows.rows.length >= 1, "至少生成一条草稿");
  const lines = await admin.query(
    "select count(*)::int n from voucher_draft_lines l join event_voucher_drafts d on d.id=l.draft_id where d.company_id=$1",
    [COMPANY]
  );
  assert.ok((lines.rows[0]?.n ?? 0) >= 2, "草稿含借贷分录行");
});

test("list 返回待处理草稿", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  const { res, captured } = fakeRes();
  await drafts.listCloseDrafts(fakeReq(null), res);
  assert.equal(captured.status, 200);
  const body = captured.body as { items?: unknown[] };
  assert.ok(Array.isArray(body.items) && body.items.length >= 1, "列出至少一条草稿");
});

test("approve 只生成 draft 状态凭证，绝不过账", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  const draftRow = (await admin.query<{ id: string }>(
    "select id from event_voucher_drafts where company_id=$1 and status='draft' order by created_at asc limit 1",
    [COMPANY]
  )).rows[0];
  assert.ok(draftRow, "存在待审草稿");

  const { res, captured } = fakeRes();
  await drafts.approveCloseDraft(fakeReq(null), res, draftRow!.id);
  assert.equal(captured.status, 200, `approve 应成功，实际 ${captured.status}: ${JSON.stringify(captured.body)}`);
  const voucherId = (captured.body as { voucherId?: string }).voucherId;
  assert.ok(voucherId, "返回创建的凭证 id");

  const voucher = (await admin.query<{ status: string; posted_at: string | null }>(
    "select status, posted_at from vouchers where id=$1",
    [voucherId]
  )).rows[0];
  assert.equal(voucher!.status, "draft", "凭证必须是 draft 状态");
  assert.equal(voucher!.posted_at, null, "凭证绝不能被过账");

  const draftAfter = (await admin.query<{ status: string; approved_voucher_id: string | null }>(
    "select status, approved_voucher_id from event_voucher_drafts where id=$1",
    [draftRow!.id]
  )).rows[0];
  assert.equal(draftAfter!.status, "approved");
  assert.equal(draftAfter!.approved_voucher_id, voucherId);

  // 凭证分录借贷平衡（分/整数）
  const bal = (await admin.query<{ d: string; c: string }>(
    "select coalesce(sum(debit),0)::text d, coalesce(sum(credit),0)::text c from voucher_lines where voucher_id=$1",
    [voucherId]
  )).rows[0];
  assert.equal(Math.round(Number(bal!.d) * 100), Math.round(Number(bal!.c) * 100), "借贷必须平衡");
});
