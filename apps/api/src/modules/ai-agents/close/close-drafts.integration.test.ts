/**
 * V8-B 任务 1：AI 草稿「待批准」状态语义统一的 DB 集成回归。
 *
 * 覆盖：
 * - GET /api/close/drafts 的三种 status 取值（pending / draft / review_required）与不传时的向后兼容；
 * - approve 一条 review_required 草稿可成功（此前只认 'draft'，闭环断裂）；
 * - 借贷不平衡的草稿仍被 400 拒绝（账务铁律，不因放宽状态而放宽校验），且不产生任何凭证；
 * - reject 同样接受待批状态；
 * - 终态（approved / rejected）不可重复 approve/reject。
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
const BUSINESS_EVENT_ID = "PUR-STD-001";

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
  const { resetTestDatabase } = await import("../../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

interface DraftFixture {
  id: string;
  status: string;
  debit: string;
  credit: string;
}

async function insertDraft(pool: pg.Pool, fixture: DraftFixture): Promise<void> {
  await pool.query(
    `insert into event_voucher_drafts (
       id, company_id, business_event_id, voucher_type, status, summary, source
     ) values ($1, $2, $3, 'payment', $4, $5, 'ai_close')`,
    [fixture.id, COMPANY_ID, BUSINESS_EVENT_ID, fixture.status, `${fixture.id} 草稿`]
  );
  await pool.query(
    `insert into voucher_draft_lines (
       id, draft_id, summary, account_code, account_name, debit, credit, sort_order
     ) values ($1, $2, '确认费用', '6601', '管理费用', $3::numeric, 0, 0),
              ($4, $2, '确认垫付', '2241', '其他应付款', 0, $5::numeric, 1)`,
    [`${fixture.id}-line-1`, fixture.id, fixture.debit, `${fixture.id}-line-2`, fixture.credit]
  );
}

/** 四条固定夹具：两条待批（分别为 draft / review_required）、一条不平衡、一条已终态。 */
async function seedDraftFixtures(pool: pg.Pool): Promise<void> {
  await insertDraft(pool, { id: "d-pending-draft", status: "draft", debit: "100.00", credit: "100.00" });
  await insertDraft(pool, { id: "d-pending-review", status: "review_required", debit: "200.00", credit: "200.00" });
  await insertDraft(pool, { id: "d-unbalanced", status: "review_required", debit: "300.00", credit: "180.00" });
  await insertDraft(pool, { id: "d-decided", status: "approved", debit: "400.00", credit: "400.00" });
}

interface DraftListBody {
  items: Array<{ id: string; status: string }>;
  total: number;
}

async function listWithStatus(status?: string): Promise<DraftListBody> {
  const { listCloseDrafts } = await import("./close-drafts.routes.js");
  const capture = createResponseCapture();
  const suffix = status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
  await listCloseDrafts(
    {
      method: "GET",
      url: `/api/close/drafts${suffix}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  const result = capture.readJson<DraftListBody>();
  assert.equal(result.statusCode, 200);
  return result.body ?? { items: [], total: 0 };
}

function idsOf(body: DraftListBody): string[] {
  return body.items.map((item) => item.id).sort();
}

test("listCloseDrafts resolves pending as the union of draft and review_required", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedDraftFixtures(pool);
    const { closePool } = await import("../../../db/client.js");

    const pending = await listWithStatus("pending");
    const draftOnly = await listWithStatus("draft");
    const reviewOnly = await listWithStatus("review_required");
    const unfiltered = await listWithStatus();

    // pending = draft + review_required，终态草稿不在其中
    assert.deepEqual(idsOf(pending), ["d-pending-draft", "d-pending-review", "d-unbalanced"]);
    // 精确查询保持原语义，既有调用方与 E2E 不受影响
    assert.deepEqual(idsOf(draftOnly), ["d-pending-draft"]);
    assert.deepEqual(idsOf(reviewOnly), ["d-pending-review", "d-unbalanced"]);
    // 不传 status 仍返回全部（含终态），向后兼容
    assert.deepEqual(idsOf(unfiltered), [
      "d-decided",
      "d-pending-draft",
      "d-pending-review",
      "d-unbalanced"
    ]);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("approveCloseDraft accepts a review_required draft and creates a draft voucher only", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedDraftFixtures(pool);
    const { approveCloseDraft } = await import("./close-drafts.routes.js");
    const { closePool } = await import("../../../db/client.js");

    const capture = createResponseCapture();
    await approveCloseDraft(
      {
        method: "POST",
        url: "/api/close/drafts/d-pending-review/approve",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response,
      "d-pending-review"
    );
    const approved = capture.readJson<{ ok: boolean; voucherId: string }>();

    assert.equal(approved.statusCode, 200);
    assert.equal(approved.body?.ok, true);

    const draftRow = await pool.query<{ status: string; approved_voucher_id: string | null }>(
      "select status, approved_voucher_id from event_voucher_drafts where id = $1",
      ["d-pending-review"]
    );
    assert.equal(draftRow.rows[0]?.status, "approved");
    assert.equal(draftRow.rows[0]?.approved_voucher_id, approved.body?.voucherId);

    // 批准只产生 status='draft' 的凭证，绝不过账
    const voucherRow = await pool.query<{ status: string; posted_at: string | null }>(
      "select status, posted_at from vouchers where id = $1",
      [approved.body?.voucherId ?? ""]
    );
    assert.equal(voucherRow.rows[0]?.status, "draft");
    assert.equal(voucherRow.rows[0]?.posted_at, null);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("approveCloseDraft still rejects an unbalanced review_required draft with 400 and writes nothing", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedDraftFixtures(pool);
    const { approveCloseDraft } = await import("./close-drafts.routes.js");
    const { closePool } = await import("../../../db/client.js");

    const capture = createResponseCapture();
    await approveCloseDraft(
      {
        method: "POST",
        url: "/api/close/drafts/d-unbalanced/approve",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response,
      "d-unbalanced"
    );
    const rejected = capture.readJson<{ error: string; sumDebitCents: number; sumCreditCents: number }>();

    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.sumDebitCents, 30000);
    assert.equal(rejected.body?.sumCreditCents, 18000);

    const draftRow = await pool.query<{ status: string }>(
      "select status from event_voucher_drafts where id = $1",
      ["d-unbalanced"]
    );
    assert.equal(draftRow.rows[0]?.status, "review_required");

    const voucherCount = await pool.query<{ n: string }>(
      "select count(*)::text n from vouchers where company_id = $1 and mapping_id = $2",
      [COMPANY_ID, "d-unbalanced"]
    );
    assert.equal(voucherCount.rows[0]?.n, "0");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("rejectCloseDraft accepts a review_required draft and refuses an already decided one", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedDraftFixtures(pool);
    const { rejectCloseDraft } = await import("./close-drafts.routes.js");
    const { closePool } = await import("../../../db/client.js");

    const rejectCapture = createResponseCapture();
    await rejectCloseDraft(
      {
        method: "POST",
        url: "/api/close/drafts/d-pending-review/reject",
        auth: createAuthContext(),
        body: { reason: "科目选错" }
      } as ApiRequest,
      rejectCapture.response,
      "d-pending-review"
    );
    assert.equal(rejectCapture.readJson<{ ok: boolean }>().statusCode, 200);

    const draftRow = await pool.query<{ status: string }>(
      "select status from event_voucher_drafts where id = $1",
      ["d-pending-review"]
    );
    assert.equal(draftRow.rows[0]?.status, "rejected");

    // 已驳回的草稿不可再次驳回
    const repeatCapture = createResponseCapture();
    await rejectCloseDraft(
      {
        method: "POST",
        url: "/api/close/drafts/d-pending-review/reject",
        auth: createAuthContext(),
        body: {}
      } as ApiRequest,
      repeatCapture.response,
      "d-pending-review"
    );
    assert.equal(repeatCapture.readJson<{ error: string }>().statusCode, 409);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("approveCloseDraft refuses a draft that is already in a terminal state", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedDraftFixtures(pool);
    const { approveCloseDraft } = await import("./close-drafts.routes.js");
    const { closePool } = await import("../../../db/client.js");

    const capture = createResponseCapture();
    await approveCloseDraft(
      {
        method: "POST",
        url: "/api/close/drafts/d-decided/approve",
        auth: createAuthContext()
      } as ApiRequest,
      capture.response,
      "d-decided"
    );
    const conflict = capture.readJson<{ error: string }>();

    assert.equal(conflict.statusCode, 409);
    assert.match(conflict.body?.error ?? "", /已批准/);

    const voucherCount = await pool.query<{ n: string }>(
      "select count(*)::text n from vouchers where mapping_id = $1",
      ["d-decided"]
    );
    assert.equal(voucherCount.rows[0]?.n, "0");

    await closePool();
  } finally {
    await pool.end();
  }
});
