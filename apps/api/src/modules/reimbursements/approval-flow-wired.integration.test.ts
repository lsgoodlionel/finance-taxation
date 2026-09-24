/**
 * 报销提交必须真的启动审批流（V16 角色实验发现的阻断缺陷）。
 *
 * ## 缺陷
 *
 * 审批引擎（`modules/approval`）写得很完整：多级流程、金额门槛、会签/或签、
 * 动态加签、参与人解析、审计留痕。而 `submitForApproval` **全仓只有它自己的
 * 测试在调用**——业务单据从来没启动过它。
 *
 * 员工在角色实验里提交了一张 2420 元、住宿已超标 580 元的报销单，
 * 而公司那条启用的流程 `afl-seed-cmp-v4-tech` 完全没有反应：
 * `approval_instances` 里没有这张单据，`/api/approval/pending` 对谁都是空的，
 * **没有任何人被通知**。
 *
 * ## 为什么单元测试测不出来
 *
 * 审批模块自己的测试直接调 `submitForApproval`，所以引擎本身一直是绿的。
 * 缺的是**「有没有人调它」**——那是模块之间的接线，
 * 任何一个模块的单元测试都看不见。
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
const FLOW_ID = "afl-fixture-reimbursement";

function auth(role: string, userId: string): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId,
    username: userId.replace("usr-v4-", "v4_"),
    departmentId: "dept-v4-sales",
    departmentName: "销售部",
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

/** 通过路由建一张报销单。**不是** store 层的 createReimbursement——
 * 这里走的是完整的 HTTP 处理器（含校验与审计），名字要区分开。 */
async function postReimbursementViaRoute(actor: AuthContext, amountCents: number) {
  const { createReimbursementRoute } = await import("./routes.js");
  const c = capture();
  await createReimbursementRoute(
    {
      method: "POST",
      url: "/api/reimbursements",
      body: {
        title: "[夹具] 审批流接线",
        expenseDate: "2026-08-10",
        lines: [
          { expenseType: "travel", accountCode: "660203", amountCents, description: "高铁票" }
        ]
      },
      auth: actor
    } as ApiRequest,
    c.response
  );
  return c.read<{ reimbursement: { id: string } }>();
}

async function transition(id: string, action: string, actor: AuthContext) {
  const { transitionReimbursementRoute } = await import("./routes.js");
  const c = capture();
  await transitionReimbursementRoute(
    {
      method: "POST",
      url: `/api/reimbursements/${id}/transition`,
      body: { action },
      auth: actor
    } as ApiRequest,
    c.response,
    id
  );
  return c.read<{ approvalTracked?: boolean; note?: string; error?: string }>();
}

test("配了审批流时，提交报销真的建出审批实例并进入待办", async (t) => {
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

  const employee = auth("role-employee", "usr-v4-employee");
  // 种子流程第一级解析出来的审批人是**会计**（usr-v4-accountant），不是财务负责人。
  // 第一版这里写的是 manager，纯属我照直觉猜的——按库里真实的参与人来。
  const approver = auth("role-accountant", "usr-v4-accountant");

  // 种子里**本来就配好了**一条报销审批流（`afl-seed-*`）——
  // 这恰恰是缺陷的严重之处：流程一直在那里，只是从提交那一刻起就没被触发过。
  const seededFlow = await pool.query<{ id: string }>(
    `select id from approval_flows
      where company_id = $1 and document_type = 'reimbursement' and is_active = true`,
    [COMPANY_ID]
  );
  assert.equal(seededFlow.rows.length, 1, "种子应当已经配好报销审批流");

  // ── 提交必须建出实例 ────────────────────────────────────────────────────
  const doc = await postReimbursementViaRoute(employee, 242000);
  assert.equal(doc.statusCode, 201);
  const id = doc.body!.reimbursement.id;

  const submitted = await transition(id, "submit", employee);
  assert.equal(submitted.statusCode, 200);
  assert.equal(
    submitted.body!.approvalTracked,
    true,
    "配了审批流就必须真的走它——此前 submitForApproval 全仓只有测试在调"
  );

  const instances = await pool.query<{ id: string; status: string; document_id: string }>(
    `select id, status, document_id from approval_instances
      where company_id = $1 and document_type = 'reimbursement' and document_id = $2`,
    [COMPANY_ID, id]
  );
  assert.equal(instances.rows.length, 1, "提交应当建出一条审批实例");
  assert.equal(instances.rows[0]!.status, "pending");

  // ── 审批人的待办里看得到它 ──────────────────────────────────────────────
  //
  // 这是整件事的意义所在：不进待办，等于没有人被通知。
  const { listPendingFor } = await import("../approval/store.js");
  const pending = await listPendingFor(COMPANY_ID, {
    userId: "usr-v4-accountant",
    roleCodes: ["role-accountant"]
  });
  assert.ok(
    pending.some((item) => item.documentId === id),
    "提交后这张单必须出现在审批人的待办里"
  );

  // ── 批准时实例跟着推进 ──────────────────────────────────────────────────
  //
  // 只建不推，待办列表会堆着一批早就处理完的单子——换一种幽灵而已。
  const approved = await transition(id, "approve", approver);
  assert.equal(approved.statusCode, 200);

  const after = await pool.query<{ status: string }>(
    `select status from approval_instances where document_id = $1`,
    [id]
  );
  assert.notEqual(
    after.rows[0]!.status,
    "pending",
    "批准之后审批实例不能还停在 pending"
  );

  const pendingAfter = await listPendingFor(COMPANY_ID, {
    userId: "usr-v4-accountant",
    roleCodes: ["role-accountant"]
  });
  assert.equal(
    pendingAfter.some((item) => item.documentId === id),
    false,
    "处理完的单据要从待办里消失"
  );
});
