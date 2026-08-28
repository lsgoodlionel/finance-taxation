/**
 * 申请单不能自批（V16）。
 *
 * ## 缺陷被一句注释掩盖了
 *
 * `transitionRequest` 里原本写着：
 *
 * ```
 * // 提交与撤回只有发起人能做。批准/驳回的判权在审批流那一侧，
 * // 这里不重复判——两处各判一次迟早不一致。
 * ```
 *
 * 「两处各判一次迟早不一致」本身是句对的话。问题是**审批流那一侧从来不存在**：
 * `submitForApproval` 全仓只有它自己的测试在调用，业务单据从没启动过它。
 *
 * 于是这句注释把一个洞说成了一个设计。实测：员工可以批准自己 8000 元的采购申请。
 *
 * ## 现在审批流接上了，为什么这一层还要判
 *
 * 没配审批流的公司走的是「由有审批权限的同事直接处理」那条路，
 * 那条路上没有别的东西拦着。**内控底线不能依赖「另有一处会管」**——
 * 尤其是当那一处可能根本没被启用的时候。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const REQUEST_ID = "req-self-approval-fixture";

test("申请单：发起人不能批准自己的单，别人可以", async (t) => {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await pool.query(
    `insert into requests (
       id, company_id, request_no, request_type, requester_user_id, title,
       amount_cents, purpose, expected_date, status, created_at, updated_at
     ) values ($1,$2,'REQ-SELF-001','procurement','usr-v4-employee','[夹具] 自批测试',
               800000,'采购服务器','2026-09-10'::date,'pending', now(), now())`,
    [REQUEST_ID, COMPANY_ID]
  );

  const { transitionRequest } = await import("./store.js");

  // ── 自己批准自己：拦 ────────────────────────────────────────────────────
  const selfApprove = await transitionRequest({
    companyId: COMPANY_ID,
    id: REQUEST_ID,
    action: "approve",
    actorUserId: "usr-v4-employee"
  });
  assert.equal(selfApprove.ok, false, "不能批准自己提交的申请单");
  assert.equal(
    !selfApprove.ok && selfApprove.failure.code,
    "REQUEST_SELF_APPROVAL"
  );

  const stillPending = await pool.query<{ status: string }>(
    `select status from requests where id = $1`,
    [REQUEST_ID]
  );
  assert.equal(stillPending.rows[0]!.status, "pending", "被拒的动作不该改变状态");

  // ── 自己驳回自己：同样拦 ────────────────────────────────────────────────
  //
  // 驳回看起来无害，但它同样是一次「自己决定自己的单」——
  // 而且能用来掩盖：提交后自己驳回，审计上看不出这单曾经存在过什么问题。
  const selfReject = await transitionRequest({
    companyId: COMPANY_ID,
    id: REQUEST_ID,
    action: "reject",
    actorUserId: "usr-v4-employee"
  });
  assert.equal(selfReject.ok, false, "驳回同样不能自己来");
  assert.equal(!selfReject.ok && selfReject.failure.code, "REQUEST_SELF_APPROVAL");

  // ── 撤回自己的单：允许 ──────────────────────────────────────────────────
  //
  // 这条要和「自己驳回」分清楚：撤回是发起人收回自己的请求，是本人动作；
  // 驳回是审批人的决定。两者语义不同，不能一起拦掉。
  const selfCancel = await transitionRequest({
    companyId: COMPANY_ID,
    id: REQUEST_ID,
    action: "cancel",
    actorUserId: "usr-v4-employee"
  });
  assert.ok(selfCancel.ok, "发起人应当能撤回自己的申请——那是本人动作，不是审批");

  // ── 别人批准：允许 ──────────────────────────────────────────────────────
  await pool.query(`update requests set status = 'pending' where id = $1`, [REQUEST_ID]);
  const byOther = await transitionRequest({
    companyId: COMPANY_ID,
    id: REQUEST_ID,
    action: "approve",
    actorUserId: "usr-v4-manager"
  });
  assert.ok(byOther.ok, "别人应当能批准这张申请单");

  const approved = await pool.query<{ status: string }>(
    `select status from requests where id = $1`,
    [REQUEST_ID]
  );
  assert.equal(approved.rows[0]!.status, "approved");
});
