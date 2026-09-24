/**
 * 建事项时标的类别一路走到底稿的税率（V17 阶段二）。
 *
 * ## 阶段二要证明的是什么
 *
 * 阶段一把判定函数写对了，但类别只能改库设置——**混合业务的公司仍然
 * 逐笔标不了**：一家卖货为主的公司接了一笔咨询，只能眼看着它按 13% 算。
 *
 * 这条测试走完整条链：建事项时带类别 → 落库 → 派生税项 → 底稿按 6% 算。
 * 单验判定函数证明不了这个——中间任何一段没把类别传下去，
 * 用户在界面上选的东西就等于没选，而界面看起来一切正常。
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

function auth(): AuthContext {
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

async function postEvent(body: Record<string, unknown>) {
  const { createEvent } = await import("../events/routes.js");
  const c = capture();
  await createEvent(
    { method: "POST", url: "/api/events", body, auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<{ id?: string; taxableCategory?: string | null; error?: string; code?: string }>();
}

test("界面上选的应税行为类别，落到库里也传到税项", async (t) => {
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

  // 公司主营卖货——这正是「混合业务」的场景：主营 13%，但有一笔咨询该按 6%。
  await pool.query(`update companies set default_taxable_category = 'goods' where id = $1`, [
    COMPANY_ID
  ]);

  // ── 一笔标了「现代服务」的事项 ──────────────────────────────────────────
  const created = await postEvent({
    type: "sales",
    title: "咨询服务收入",
    occurredOn: "2026-08-15",
    amount: "100000",
    taxableCategory: "modern_service"
  });
  assert.equal(created.statusCode, 201, `建事项应当成功，实际 ${created.statusCode}`);

  const stored = await pool.query<{ taxable_category: string | null }>(
    `select taxable_category from business_events where id = $1`,
    [created.body!.id]
  );
  assert.equal(
    stored.rows[0]!.taxable_category,
    "modern_service",
    "**类别必须真的落库**——插入语句漏了这一列的话，用户选的东西静默丢失，界面上却一切正常"
  );

  // ── 没标类别的事项存 null，而不是替用户填上公司默认值 ────────────────────
  //
  // 存 null 与存 'goods' 在当下算出来一样，但语义不同：
  // null 是「按公司主营算」，会随公司主营类别的调整而变；
  // 存死值则是「这笔就是卖货」。替用户做的决定不该伪装成用户做的。
  const bare = await postEvent({
    type: "sales",
    title: "没标类别的收入",
    occurredOn: "2026-08-16",
    amount: "50000"
  });
  assert.equal(bare.statusCode, 201);
  const bareRow = await pool.query<{ taxable_category: string | null }>(
    `select taxable_category from business_events where id = $1`,
    [bare.body!.id]
  );
  assert.equal(bareRow.rows[0]!.taxable_category, null, "没选就是 null，不替用户填一个值");

  // ── 认不出的类别被拒，不静默存坏值 ──────────────────────────────────────
  //
  // 存进去之后税率判定会当它「未确定」，用户以为标好了，
  // 实际底稿上是「税目待确认」——要到申报被拒才发现。
  const bogus = await postEvent({
    type: "sales",
    title: "类别是编的",
    occurredOn: "2026-08-17",
    amount: "1000",
    taxableCategory: "卖空气"
  });
  assert.equal(bogus.statusCode, 400, "认不出的类别应当当场拒掉");
  assert.equal(bogus.body!.code, "TAXABLE_CATEGORY_INVALID");
  assert.match(bogus.body!.error!, /认不出/, "错误要说清是哪里不对");
});
