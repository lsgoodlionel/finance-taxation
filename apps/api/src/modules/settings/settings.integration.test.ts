/**
 * 系统设置的路径级断言（P0-1）。
 *
 * ## 这个模块此前零测试
 *
 * 694 行、13 个导出路由，一条测试都没有——一个月回顾把它列为
 * 「14 个零测试模块」里最大的一个，P0 明确点名从它开始。
 *
 * ## 三段式
 *
 * P0 要求「所有写路由至少一条『成功 + 越权被拒 + 前置校验被拒』的用例」。
 * 这三段各自防的是不同的事：
 *
 * - **成功**：功能真的能用（本月最严重的四个缺陷都是「从未可用」）
 * - **越权被拒**：别家公司的数据碰不到（路由权限之外还要有数据归属）
 * - **前置校验被拒**：脏数据进不来，且**拒绝时一行都不落库**
 *
 * ## 密钥不回显
 *
 * AI 配置与集成配置里都有 apiKey。读接口必须掩码，
 * 而「掩码了没有」只有走真实路径才测得出来——纯函数测不到它有没有被调用。
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

/** 调路由并读回状态码与响应体。**不绕过 handler**——绕过就退回成函数级测试了。 */
async function callRoute(
  handler: (req: ApiRequest, res: ServerResponse) => Promise<void>,
  req: Partial<ApiRequest>
) {
  const capture = createResponseCapture();
  await handler({ auth: createAuthContext(), ...req } as ApiRequest, capture.response);
  return capture.readJson();
}

test("系统设置：公司信息、AI 配置、外部对接的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const {
    getCompanySettings,
    updateCompanySettings,
    getAiSettings,
    updateAiSettings,
    getUserList
  } = await import("./routes.js");
  const { listIntegrationConfigs, upsertIntegrationConfig, getIntegrationConfig } = await import(
    "./integration-config.routes.js"
  );

  // ── 公司信息 ──────────────────────────────────────────────────────────

  await t.test("读公司信息：返回本公司的档案", async () => {
    const result = await callRoute(getCompanySettings, {
      method: "GET",
      url: "/api/settings/company"
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.body!.name, "公司名不该为空");
    assert.equal(result.body!.id, COMPANY_ID);
  });

  await t.test("改公司信息：成功", async () => {
    const result = await callRoute(updateCompanySettings, {
      method: "PUT",
      url: "/api/settings/company",
      body: { name: "V4 科技（改名后）", contactPhone: "0755-12345678" }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.name, "V4 科技（改名后）");
    assert.equal(result.body!.contactPhone, "0755-12345678");

    // 真的落库了，不是只在返回值里
    const row = await pool.query<{ name: string }>("select name from companies where id=$1", [
      COMPANY_ID
    ]);
    assert.equal(row.rows[0]!.name, "V4 科技（改名后）");
  });

  await t.test("改公司信息：一个字段都没传时被拒，且不落库", async () => {
    const before = await pool.query<{ updated_at: string }>(
      "select updated_at::text from companies where id=$1",
      [COMPANY_ID]
    );

    const result = await callRoute(updateCompanySettings, {
      method: "PUT",
      url: "/api/settings/company",
      body: {}
    });
    assert.equal(result.statusCode, 400);
    assert.match(result.body!.error, /没有要更新的字段/);

    // **拒绝时一行都不落库**——空更新若走到 SQL，会把 updated_at 推到现在，
    // 让「这条记录什么时候改的」失去意义。
    const after = await pool.query<{ updated_at: string }>(
      "select updated_at::text from companies where id=$1",
      [COMPANY_ID]
    );
    assert.equal(after.rows[0]!.updated_at, before.rows[0]!.updated_at);
  });

  await t.test("越权：只能读到自己公司的档案", async () => {
    const capture = createResponseCapture();
    await getCompanySettings(
      {
        method: "GET",
        url: "/api/settings/company",
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response
    );
    const other = capture.readJson();
    assert.equal(other.statusCode, 200);
    // 换了 companyId 读到的就是另一家——档案按 auth 里的公司取，不接受入参指定。
    assert.equal(other.body!.id, OTHER_COMPANY_ID);
    assert.notEqual(other.body!.name, "V4 科技（改名后）");
  });

  // ── AI 配置：密钥不回显 ───────────────────────────────────────────────

  await t.test("存 AI 配置：成功", async () => {
    const result = await callRoute(updateAiSettings, {
      method: "PUT",
      url: "/api/settings/ai",
      body: { provider: "anthropic", model: "claude-sonnet-4", apiKey: "sk-test-abcdefghijklmnop" }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.provider, "anthropic");
    assert.equal(result.body!.apiKeyConfigured, true);
  });

  await t.test("读 AI 配置：密钥必须掩码，原文一个字符都不能出现", async () => {
    const result = await callRoute(getAiSettings, { method: "GET", url: "/api/settings/ai" });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.apiKeyConfigured, true);

    // 整个响应体序列化后不能含密钥原文——将来加字段时漏掩码，这条会拦下。
    const serialized = JSON.stringify(result.body);
    assert.equal(
      serialized.includes("sk-test-abcdefghijklmnop"),
      false,
      "密钥原文出现在响应里"
    );
    assert.match(result.body!.apiKeyMasked, /\*/, "掩码里应当有星号");
  });

  await t.test("存 AI 配置：不传 provider 被拒", async () => {
    const result = await callRoute(updateAiSettings, {
      method: "PUT",
      url: "/api/settings/ai",
      body: { model: "some-model" }
    });
    assert.equal(result.statusCode, 400);
    assert.match(result.body!.error, /provider/);
  });

  await t.test("改 AI 配置时不传密钥：保持原密钥，不清空", async () => {
    await callRoute(updateAiSettings, {
      method: "PUT",
      url: "/api/settings/ai",
      body: { provider: "openai", model: "gpt-4o" }
    });

    const after = await callRoute(getAiSettings, { method: "GET", url: "/api/settings/ai" });
    // 换个模型不该把密钥清掉——「改个别的字段把密钥清了」表现出来是
    // 「昨天还能用今天不能用」，排查要绕一大圈。
    assert.equal(after.body!.apiKeyConfigured, true, "密钥被清掉了");
    assert.equal(after.body!.provider, "openai");
  });

  // ── 外部对接 ──────────────────────────────────────────────────────────

  await t.test("读对接配置：没配过也返回默认项，不返回空", async () => {
    const result = await callRoute(listIntegrationConfigs, {
      method: "GET",
      url: "/api/settings/integrations"
    });
    assert.equal(result.statusCode, 200);
    const types = (result.body!.items as Array<{ configType: string }>).map((i) => i.configType);
    // 三个内置类型必须都在——返回空会让配置页显示成「什么都没有」，
    // 而用户不知道该从哪开始。
    for (const type of ["invoice_verify", "bank_api", "notification"]) {
      assert.ok(types.includes(type), `缺默认项 ${type}`);
    }
    assert.ok(result.body!.providers, "应当带服务商清单供前台选");
  });

  await t.test("存对接配置：成功，且密钥掩码", async () => {
    // configType 是**路由参数**不在 body 里——第一版漏传，撞了库上的
    // not-null 约束。这正是路由级测试的价值：函数级测试拿不到这个签名差异。
    const savedCapture = createResponseCapture();
    await upsertIntegrationConfig(
      {
        method: "PUT",
        url: "/api/settings/integrations/invoice_verify",
        auth: createAuthContext(),
        body: { provider: "baiwang", apiKey: "bw-secret-key-123456", enabled: true }
      } as ApiRequest,
      savedCapture.response,
      "invoice_verify"
    );
    const saved = savedCapture.readJson();
    assert.equal(saved.statusCode, 200);

    const readCapture = createResponseCapture();
    await getIntegrationConfig(
      {
        method: "GET",
        url: "/api/settings/integrations/invoice_verify",
        auth: createAuthContext()
      } as ApiRequest,
      readCapture.response,
      "invoice_verify"
    );
    const read = readCapture.readJson();
    assert.equal(read.statusCode, 200);
    assert.equal(
      JSON.stringify(read.body).includes("bw-secret-key-123456"),
      false,
      "对接配置的密钥原文出现在响应里"
    );
  });

  await t.test("对接配置按公司隔离：别家配的读不到", async () => {
    const capture = createResponseCapture();
    await getIntegrationConfig(
      {
        method: "GET",
        url: "/api/settings/integrations/invoice_verify",
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response,
      "invoice_verify"
    );
    const other = capture.readJson();
    assert.equal(other.statusCode, 200);
    // 另一家没配过，应当拿到默认值而不是本公司刚存的 baiwang。
    assert.notEqual(other.body!.config.provider, "baiwang");
  });

  // ── 用户列表 ──────────────────────────────────────────────────────────

  await t.test("用户列表：只返回本公司的人", async () => {
    const result = await callRoute(getUserList, { method: "GET", url: "/api/settings/users" });
    assert.equal(result.statusCode, 200);
    const users = result.body!.items as Array<{ id: string }>;
    assert.ok(users.length > 0, "本公司应当有用户");

    const ids = users.map((u) => u.id);
    const others = await pool.query<{ id: string }>("select id from users where company_id=$1", [
      OTHER_COMPANY_ID
    ]);
    for (const row of others.rows) {
      assert.equal(ids.includes(row.id), false, `泄漏了别家公司的用户 ${row.id}`);
    }
  });
});
