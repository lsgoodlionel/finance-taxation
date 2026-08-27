/**
 * 报销单不能自批自付（V16 角色实验发现的权限漏洞）。
 *
 * ## 缺陷
 *
 * `POST /api/reimbursements/:id/transition` 只由 `expense.submit` 守护，
 * 而**每个员工都持有它**；`transitionReimbursement(companyId, id, action)`
 * 又根本不接收操作人。三个角色各自撞到了它的不同侧面：
 *
 * - **员工**：对自己 2420 元（住宿已超标 580 元）的单发 `approve` → 200，
 *   直接生成凭证草稿进了会计队列
 * - **员工**：对**出纳的**报销单发 `submit` → 200，改动了别人的单据
 * - **出纳**：自借、自批、自付备用金，同一个人 36 毫秒走完全流程
 *
 * 归属规则在 `access/ownership.ts` 里早就写好了（`applicant_user_id` +
 * `expense.manage`），**只是从来没有人调用它**。
 *
 * ## 这条为什么单元测试测不出来
 *
 * `transitionReimbursement` 的签名里压根没有操作人这个概念，
 * 针对它写的单元测试再多，也只能验证状态机本身——
 * **谁在推动状态机，是这个函数看不见的信息。**
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
  return c.read<{ error?: string; code?: string; status?: string }>();
}

test("报销单：本人不能批准自己的单，也不能动别人的单", async (t) => {
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
  const other = auth("role-employee", "usr-v4-cashier");
  const manager = auth("role-finance-director", "usr-v4-manager");

  // 员工建一张自己的报销单
  const { createReimbursementRoute } = await import("./routes.js");
  const createCapture = capture();
  await createReimbursementRoute(
    {
      method: "POST",
      url: "/api/reimbursements",
      // 按真实契约填：expenseDate 必填，每行明细必须有 accountCode 与 expenseType。
      body: {
        title: "[夹具] 自批测试",
        expenseDate: "2026-08-10",
        lines: [
          {
            expenseType: "travel",
            accountCode: "660203",
            amountCents: 50000,
            description: "高铁票"
          }
        ]
      },
      auth: employee
    } as ApiRequest,
    createCapture.response
  );
  const created = createCapture.read<{ reimbursement: { id: string } }>();
  assert.equal(created.statusCode, 201, "建单应当成功");
  const id = created.body!.reimbursement.id;

  // ── 别人不能动我的单 ────────────────────────────────────────────────────
  const byOther = await transition(id, "submit", other);
  assert.equal(byOther.statusCode, 403, "别人不该能提交我的报销单");
  assert.equal(byOther.body!.code, "REIMBURSEMENT_NOT_OWNER");

  // ── 自己提交是可以的 ────────────────────────────────────────────────────
  const submitted = await transition(id, "submit", employee);
  assert.equal(submitted.statusCode, 200, "本人提交自己的单应当成功");

  // ── 自己不能批准自己 ────────────────────────────────────────────────────
  //
  // 这是内控底线，任何角色都绕不过去。
  const selfApprove = await transition(id, "approve", employee);
  assert.equal(selfApprove.statusCode, 403, "不能审批自己提交的报销单");
  assert.equal(selfApprove.body!.code, "REIMBURSEMENT_SELF_APPROVAL");
  assert.match(selfApprove.body!.error!, /不能审批自己/, "错误文案要说人话");

  // 单据状态没有被推动。
  const stillPending = await pool.query<{ status: string }>(
    `select status from reimbursements where id = $1`,
    [id]
  );
  assert.equal(stillPending.rows[0]!.status, "pending", "被拒的动作不该改变状态");

  // ── 没有审批权的人也不能批 ──────────────────────────────────────────────
  const byOtherEmployee = await transition(id, "approve", other);
  assert.equal(byOtherEmployee.statusCode, 403, "普通员工没有费用审批权");
  assert.equal(byOtherEmployee.body!.code, "REIMBURSEMENT_APPROVAL_FORBIDDEN");

  // ── 有审批权的他人可以批 ────────────────────────────────────────────────
  const approved = await transition(id, "approve", manager);
  assert.equal(approved.statusCode, 200, "财务负责人应当能批准别人的报销单");

  const finalStatus = await pool.query<{ status: string }>(
    `select status from reimbursements where id = $1`,
    [id]
  );
  assert.equal(finalStatus.rows[0]!.status, "approved");
});
