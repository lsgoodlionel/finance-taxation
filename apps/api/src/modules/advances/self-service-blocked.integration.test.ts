/**
 * 借款单：不能自借自批自付（V16 角色实验在**真实审计日志**里发现的）。
 *
 * ## 缺陷
 *
 * `POST /api/advances/:id/transition` 只由 `expense.submit` 守护（每个员工都持有），
 * `transitionAdvance` 又不接收操作人；而打款走的是另一条独立路径
 * `POST /api/advances/:id/pay`，同样不看是谁在付。
 *
 * 出纳同时持有 `expense.submit`（提单）与 `banking.manage`（付款），
 * 于是可以自借 → 自批 → 自付走完全程。角色实验在审计日志里翻出 **3 组**这样的记录：
 *
 * ```
 * 09:22:09.713 usr-v4-cashier advance.submit  ADV-202608-0001
 * 09:22:09.727 usr-v4-cashier advance.approve ADV-202608-0001
 * 09:22:09.749 usr-v4-cashier advance.pay     ADV-202608-0001
 * ```
 *
 * 同一个人 36 毫秒走完，公司的钱就出去了。
 *
 * ## 两条路径都要拦
 *
 * 只拦 transition 是不够的——打款是独立接口，不拦一样能绕过去。
 * 这条测试因此把两条路径都走一遍。
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

async function postAdvanceViaRoute(actor: AuthContext, amountCents: number) {
  const { createAdvanceRoute } = await import("./routes.js");
  const c = capture();
  await createAdvanceRoute(
    {
      method: "POST",
      url: "/api/advances",
      body: { amountCents, purpose: "[夹具] 自借自批测试", expectedReturnDate: "2026-09-30" },
      auth: actor
    } as ApiRequest,
    c.response
  );
  return c.read<{ advance: { id: string } }>();
}

async function transitionViaRoute(id: string, action: string, actor: AuthContext) {
  const { transitionAdvanceRoute } = await import("./routes.js");
  const c = capture();
  await transitionAdvanceRoute(
    {
      method: "POST",
      url: `/api/advances/${id}/transition`,
      body: { action },
      auth: actor
    } as ApiRequest,
    c.response,
    id
  );
  return c.read<{ error?: string; code?: string }>();
}

async function payViaRoute(id: string, actor: AuthContext) {
  const { payAdvanceRoute } = await import("./routes.js");
  const c = capture();
  await payAdvanceRoute(
    { method: "POST", url: `/api/advances/${id}/pay`, body: {}, auth: actor } as ApiRequest,
    c.response,
    id
  );
  return c.read<{ error?: string; code?: string; voucherId?: string }>();
}

test("借款单：自己批自己、自己给自己打款，两条路径都被拦住", async (t) => {
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

  // 出纳同时有 expense.submit（提单）与 banking.manage（付款）——
  // 这个组合正是缺陷成立的前提。
  const cashier = auth("role-cashier", "usr-v4-cashier");
  const manager = auth("role-finance-director", "usr-v4-manager");

  const created = await postAdvanceViaRoute(cashier, 500000);
  assert.equal(created.statusCode, 201, "出纳可以给自己提借款单——这是正常的");
  const id = created.body!.advance.id;

  // ── 自己提交：允许 ──────────────────────────────────────────────────────
  const submitted = await transitionViaRoute(id, "submit", cashier);
  assert.equal(submitted.statusCode, 200, "提交自己的单是本人动作");

  // ── 自己批准：拦 ────────────────────────────────────────────────────────
  const selfApprove = await transitionViaRoute(id, "approve", cashier);
  assert.equal(selfApprove.statusCode, 403, "不能批准自己的借款单");
  assert.equal(selfApprove.body!.code, "ADVANCE_SELF_APPROVAL");

  const stillPending = await pool.query<{ status: string }>(
    `select status from advances where id = $1`,
    [id]
  );
  assert.notEqual(stillPending.rows[0]!.status, "approved", "被拒的动作不该改变状态");

  // ── 别人批准：允许 ──────────────────────────────────────────────────────
  const approved = await transitionViaRoute(id, "approve", manager);
  assert.equal(approved.statusCode, 200, "有审批权的他人可以批");

  // ── 自己给自己打款：拦 ──────────────────────────────────────────────────
  //
  // **这是独立路径**：只拦 transition 的话，这里照样能把钱付出去。
  const selfPay = await payViaRoute(id, cashier);
  assert.equal(selfPay.statusCode, 403, "不能给自己打款——打款是独立接口，必须单独拦");
  assert.equal(selfPay.body!.code, "ADVANCE_SELF_APPROVAL");

  const noVoucher = await pool.query<{ n: string }>(
    `select count(*)::text n from vouchers where id like 'vch-adv-%'`
  );
  assert.equal(noVoucher.rows[0]!.n, "0", "被拒的打款不该留下任何付款凭证");

  // ── 别人打款：允许 ──────────────────────────────────────────────────────
  const paid = await payViaRoute(id, manager);
  assert.equal(paid.statusCode, 200, "有审批权的他人可以打款");
  assert.ok(paid.body!.voucherId, "打款应当生成付款凭证草稿");
});
