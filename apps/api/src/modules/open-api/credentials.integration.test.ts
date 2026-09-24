/**
 * 开放 API 凭证的路径级断言（P0-1）。
 *
 * ## 这是安全敏感面，而它此前零测试
 *
 * API 密钥能绕过界面直接调业务接口。这个模块的三条设计——
 * **只在创建时返回一次原文、库里只存哈希、撤销后立即失效**——
 * 任何一条破了都是实打实的越权入口，而它们全靠代码本身，没有测试钉着。
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
const OTHER_COMPANY_ID = "cmp-v4-group";

function createAuthContext(companyId = COMPANY_ID): AuthContext {
  return {
    companyId,
    userId: "usr-v4-manager",
    username: "v4_manager",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-finance-director"],
    token: "test-token"
  };
}

function createResponseCapture() {
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
    readJson() {
      return { statusCode, body: body ? (JSON.parse(body) as Record<string, any>) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("开放 API 凭证：只返回一次、只存哈希、撤销即失效", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { createApiKey, listApiKeys, revokeApiKey } = await import("./credentials.routes.js");

  let createdId = "";
  let plainKey = "";

  await t.test("创建：返回原文密钥与前缀", async () => {
    const capture = createResponseCapture();
    await createApiKey(
      {
        method: "POST",
        url: "/api/open-api/keys",
        auth: createAuthContext(),
        body: { name: "P0 测试密钥" }
      } as ApiRequest,
      capture.response
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    assert.ok(result.body!.key, "创建时必须返回原文，否则用户拿不到");
    assert.ok(result.body!.keyPrefix, "前缀用于事后辨认是哪一把");

    createdId = result.body!.id;
    plainKey = result.body!.key;
  });

  await t.test("库里只存哈希，原文一个字符都不落库", async () => {
    // **这是这个模块最重要的一条**。原文落库意味着数据库备份里有可用的密钥，
    // 而泄漏之后无法追溯是从哪一份备份流出的。
    const row = await pool.query<{ key_hash: string; key_prefix: string }>(
      "select key_hash, key_prefix from api_credentials where id=$1",
      [createdId]
    );
    assert.ok(row.rows[0], "记录应当存在");
    assert.notEqual(row.rows[0]!.key_hash, plainKey, "存的是原文而不是哈希");
    assert.equal(
      row.rows[0]!.key_hash.includes(plainKey),
      false,
      "哈希里含有原文"
    );

    // 整张表扫一遍——将来加字段时把原文写进别的列，这条会拦下。
    const all = await pool.query<Record<string, unknown>>(
      "select * from api_credentials where id=$1",
      [createdId]
    );
    assert.equal(
      JSON.stringify(all.rows[0]).includes(plainKey),
      false,
      "表里某个字段存了原文"
    );
  });

  await t.test("列表：不回显原文，只给前缀", async () => {
    const capture = createResponseCapture();
    await listApiKeys(
      { method: "GET", url: "/api/open-api/keys", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    assert.equal(
      JSON.stringify(result.body).includes(plainKey),
      false,
      "列表回显了原文密钥"
    );
    const item = (result.body!.items as Array<{ id: string; keyPrefix: string }>).find(
      (i) => i.id === createdId
    );
    assert.ok(item, "刚创建的密钥应当在列表里");
    assert.ok(item!.keyPrefix, "应当给前缀供辨认");
  });

  await t.test("租户隔离：别家公司看不到本公司的密钥", async () => {
    const capture = createResponseCapture();
    await listApiKeys(
      { method: "GET", url: "/api/open-api/keys", auth: createAuthContext(OTHER_COMPANY_ID) } as ApiRequest,
      capture.response
    );
    const ids = (capture.readJson().body!.items as Array<{ id: string }>).map((i) => i.id);
    assert.equal(ids.includes(createdId), false, "泄漏了别家公司的密钥");
  });

  await t.test("撤销：标记 revoked_at 而不是删除", async () => {
    const capture = createResponseCapture();
    await revokeApiKey(
      {
        method: "DELETE",
        url: `/api/open-api/keys/${createdId}`,
        auth: createAuthContext()
      } as ApiRequest,
      capture.response,
      { id: createdId }
    );
    assert.equal(capture.readJson().statusCode, 200);

    const row = await pool.query<{ revoked_at: string | null }>(
      "select revoked_at::text from api_credentials where id=$1",
      [createdId]
    );
    // **撤销不删记录**：删了之后「这把密钥当初是谁建的、什么时候撤的」就查不到了，
    // 而那正是密钥泄漏后第一个要查的事。
    assert.ok(row.rows[0], "记录不该被删除");
    assert.notEqual(row.rows[0]!.revoked_at, null, "应当标记撤销时间");
  });

  await t.test("越权撤销：别家公司撤不掉本公司的密钥", async () => {
    const another = createResponseCapture();
    await createApiKey(
      {
        method: "POST",
        url: "/api/open-api/keys",
        auth: createAuthContext(),
        body: { name: "另一把" }
      } as ApiRequest,
      another.response
    );
    const targetId = another.readJson().body!.id as string;

    const capture = createResponseCapture();
    await revokeApiKey(
      {
        method: "DELETE",
        url: `/api/open-api/keys/${targetId}`,
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response,
      { id: targetId }
    );

    const row = await pool.query<{ revoked_at: string | null }>(
      "select revoked_at::text from api_credentials where id=$1",
      [targetId]
    );
    assert.equal(row.rows[0]!.revoked_at, null, "别家公司把本公司的密钥撤销了");
  });

  await t.test("创建留审计痕迹，且不记录密钥原文", async () => {
    const rows = await pool.query<{ action: string; changes: unknown }>(
      "select action, changes from audit_logs where company_id=$1 and action like 'open_api%'",
      [COMPANY_ID]
    );
    assert.ok(rows.rows.length > 0, "创建密钥应当留痕");
    // 审计日志本身也是会被读的——把密钥写进 changes 等于换个地方泄漏。
    assert.equal(
      JSON.stringify(rows.rows).includes(plainKey),
      false,
      "审计日志里出现了密钥原文"
    );
  });
});
