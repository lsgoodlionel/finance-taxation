/**
 * 成本中心从申请单流到凭证的整条链路（V13 残留 6）。
 *
 * ```
 * requests.cost_center_id
 *   → business_events.cost_center_id     （审批通过派生时）
 *     → voucher_draft_lines.cost_center_id （生成草稿时）
 *       → voucher_lines.cost_center_id     （草稿转正式时）
 * ```
 *
 * 断在任何一段，做账的人都要重新选一次部门——而他未必知道申请人当初填的
 * 是哪个。填错了不会报错，那笔费用只是悄悄归到了另一个部门头上。
 *
 * 所以这条测试逐段断言，而不是只看两头。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const TRAVEL_ACCOUNT = "660203";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("成本中心从申请单流到凭证", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createRequest, transitionRequest } = await import("./store.js");

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  // 种子已经播了成本中心（SEED-RD / SEED-MK），取一个用。
  const ccRow = await pool.query<{ id: string; name: string }>(
    `select id, name from cost_centers where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  assert.ok(ccRow.rows.length > 0, "种子应有成本中心");
  const costCenterId = ccRow.rows[0]!.id;

  const created = await createRequest({
    companyId: COMPANY_ID,
    requestType: "travel",
    title: "带部门的出差申请",
    purpose: "验证成本中心链路",
    amountCents: 200000,
    costCenterId,
    accountCode: TRAVEL_ACCOUNT,
    expectedDate: "2026-11-10",
    requesterUserId: userId,
    note: null
  });
  assert.equal(created.ok, true);
  const requestId = created.ok ? created.value.id : "";

  let eventId = "";

  await t.test("第一段：审批通过后事项带上成本中心", async () => {
    await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "submit",
      actorUserId: userId
    });
    const approved = await transitionRequest({
      companyId: COMPANY_ID,
      id: requestId,
      action: "approve",
      actorUserId: userId
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    eventId = approved.value.businessEventId ?? "";
    assert.ok(eventId, "应派生事项");

    const event = await pool.query<{ cost_center_id: string | null }>(
      `select cost_center_id from business_events where id = $1`,
      [eventId]
    );
    assert.equal(
      event.rows[0]?.cost_center_id,
      costCenterId,
      "事项上的成本中心应与申请单一致"
    );
  });

  await t.test("第二段：生成的凭证草稿行带上成本中心", async () => {
    const { generateCloseDrafts } = await import("../ai-agents/close/close-drafts.routes.js");

    // 直接调路由函数，用最小的 req/res 桩。
    let body = "";
    const res = {
      writeHead() {
        return res;
      },
      end(chunk?: string) {
        if (chunk) body += chunk;
        return res;
      }
    } as unknown as import("node:http").ServerResponse;

    await generateCloseDrafts(
      {
        method: "POST",
        url: "/api/close/drafts/generate",
        auth: {
          companyId: COMPANY_ID,
          userId,
          username: "tester",
          departmentId: null,
          departmentName: "",
          roleCodes: ["role-accountant"],
          token: "t"
        },
        body: { period: "2026-11" }
      } as never,
      res
    );

    const lines = await pool.query<{ cost_center_id: string | null }>(
      `select l.cost_center_id
         from voucher_draft_lines l
         join event_voucher_drafts d on d.id = l.draft_id
        where d.business_event_id = $1`,
      [eventId]
    );

    assert.ok(lines.rows.length > 0, `应为事项生成草稿行（响应：${body.slice(0, 200)}）`);
    assert.ok(
      lines.rows.every((row) => row.cost_center_id === costCenterId),
      "每一条草稿行都应带上事项的成本中心"
    );
  });

  await t.test("第三段：草稿批准后正式凭证行仍带着它", async () => {
    const { approveCloseDraft } = await import("../ai-agents/close/close-drafts.routes.js");

    const draft = await pool.query<{ id: string }>(
      `select id from event_voucher_drafts where business_event_id = $1 limit 1`,
      [eventId]
    );
    assert.ok(draft.rows.length > 0);
    const draftId = draft.rows[0]!.id;

    let body = "";
    const res = {
      writeHead() {
        return res;
      },
      end(chunk?: string) {
        if (chunk) body += chunk;
        return res;
      }
    } as unknown as import("node:http").ServerResponse;

    await approveCloseDraft(
      {
        method: "POST",
        url: `/api/close/drafts/${draftId}/approve`,
        auth: {
          companyId: COMPANY_ID,
          userId,
          username: "tester",
          departmentId: null,
          departmentName: "",
          roleCodes: ["role-accountant"],
          token: "t"
        },
        body: {}
      } as never,
      res,
      draftId
    );

    const parsed = body ? (JSON.parse(body) as { voucherId?: string; error?: string }) : {};
    assert.ok(parsed.voucherId, `草稿应批准成功（响应：${body.slice(0, 200)}）`);

    const lines = await pool.query<{ cost_center_id: string | null }>(
      `select cost_center_id from voucher_lines where voucher_id = $1`,
      [parsed.voucherId]
    );

    assert.ok(lines.rows.length > 0, "应生成凭证行");
    assert.ok(
      lines.rows.every((row) => row.cost_center_id === costCenterId),
      "正式凭证行仍应带着申请单当初填的部门——这是整条链路的终点"
    );
  });

  await t.test("没填部门的申请单不会凭空造一个出来", async () => {
    // 与 V12-D1 的处理一致：不丢弃也不摊派，留空让它落进「未指定」。
    const noCc = await createRequest({
      companyId: COMPANY_ID,
      requestType: "other",
      title: "没填部门",
      purpose: "验证空值不被编造",
      amountCents: 10000,
      costCenterId: null,
      accountCode: TRAVEL_ACCOUNT,
      expectedDate: "2026-11-15",
      requesterUserId: userId,
      note: null
    });
    assert.equal(noCc.ok, true);
    if (!noCc.ok) return;

    await transitionRequest({
      companyId: COMPANY_ID,
      id: noCc.value.id,
      action: "submit",
      actorUserId: userId
    });
    const approved = await transitionRequest({
      companyId: COMPANY_ID,
      id: noCc.value.id,
      action: "approve",
      actorUserId: userId
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    const event = await pool.query<{ cost_center_id: string | null }>(
      `select cost_center_id from business_events where id = $1`,
      [approved.value.businessEventId]
    );
    assert.equal(event.rows[0]?.cost_center_id, null, "没填就该是 null，不该编一个默认部门");
  });
});
