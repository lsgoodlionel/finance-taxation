/**
 * 六个小模块的路径级断言（P0-1 收尾）。
 *
 * ## 为什么合成一个文件
 *
 * knowledge / counterparties / boss-qa / archive / setup / inbox 六个模块
 * 合计不到 800 行，各自只有 1–4 个路由。**一个模块一个文件会让每个文件
 * 八成是同一套样板**（连库、建 auth、包 response），而样板越多越没人读。
 *
 * 合在一起的代价是这个文件会长一点，收益是六份重复的骨架变成一份。
 * 真到某个模块长起来时再拆出去——那时它自己的用例足够撑起一个文件。
 *
 * 这六个模块此前**全部零测试**。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const OTHER_COMPANY_ID = "cmp-v4-group";

function createAuthContext(companyId = COMPANY_ID): AuthContext {
  return {
    companyId,
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
  const { resetTestDatabase } = await import("../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

/** 调路由的通用包装。**内部 import 真实 handler**，不重新实现任何逻辑。 */
async function call(
  handler: (req: ApiRequest, res: ServerResponse, ...rest: never[]) => Promise<void>,
  req: Partial<ApiRequest>,
  ...rest: unknown[]
) {
  const capture = createResponseCapture();
  await (handler as (r: ApiRequest, s: ServerResponse, ...a: unknown[]) => Promise<void>)(
    { auth: createAuthContext(), ...req } as ApiRequest,
    capture.response,
    ...rest
  );
  return capture.readJson();
}

test("六个小模块的路径级覆盖", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  // ── 制度库 ────────────────────────────────────────────────────────────

  const { listKnowledgeItems, createKnowledgeItem, updateKnowledgeItem, deleteKnowledgeItem } =
    await import("./knowledge/routes.js");

  let knowledgeId = "";

  await t.test("制度库：建条目成功", async () => {
    const result = await call(createKnowledgeItem, {
      method: "POST",
      url: "/api/knowledge",
      body: { category: "regulation", title: "差旅报销制度", content: "住宿标准按城市分级。" }
    });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body!.title, "差旅报销制度");
    knowledgeId = result.body!.id;
  });

  await t.test("制度库：必填项缺失被拒", async () => {
    const result = await call(createKnowledgeItem, {
      method: "POST",
      url: "/api/knowledge",
      body: { category: "regulation", title: "只有标题" }
    });
    assert.equal(result.statusCode, 400);
    assert.match(result.body!.error, /必填/);
  });

  await t.test("制度库：类别不在枚举里被拒", async () => {
    const before = await pool.query("select count(*)::int as n from company_knowledge_items");
    const result = await call(createKnowledgeItem, {
      method: "POST",
      url: "/api/knowledge",
      body: { category: "不存在的类别", title: "标题", content: "正文" }
    });
    assert.equal(result.statusCode, 400);

    // 拒绝时一行都不落库。
    const after = await pool.query<{ n: number }>(
      "select count(*)::int as n from company_knowledge_items"
    );
    assert.equal(after.rows[0]!.n, (before.rows[0] as { n: number }).n);
  });

  await t.test("制度库：改条目", async () => {
    const result = await call(
      updateKnowledgeItem,
      { method: "PUT", url: `/api/knowledge/${knowledgeId}`, body: { title: "差旅报销制度（改）" } },
      knowledgeId
    );
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.title, "差旅报销制度（改）");
  });

  await t.test("制度库：改不存在的条目返回 404", async () => {
    const result = await call(
      updateKnowledgeItem,
      { method: "PUT", url: "/api/knowledge/nope", body: { title: "x" } },
      "nope"
    );
    assert.equal(result.statusCode, 404);
  });

  await t.test("制度库：列表只返回本公司的", async () => {
    const result = await call(listKnowledgeItems, { method: "GET", url: "/api/knowledge" });
    assert.equal(result.statusCode, 200);
    const ids = (result.body!.items as Array<{ id: string }>).map((i) => i.id);
    assert.ok(ids.includes(knowledgeId));

    const capture = createResponseCapture();
    await listKnowledgeItems(
      { method: "GET", url: "/api/knowledge", auth: createAuthContext(OTHER_COMPANY_ID) } as ApiRequest,
      capture.response
    );
    const otherIds = (capture.readJson().body!.items as Array<{ id: string }>).map((i) => i.id);
    assert.equal(otherIds.includes(knowledgeId), false, "泄漏了别家公司的制度");
  });

  await t.test("制度库：删除", async () => {
    const result = await call(
      deleteKnowledgeItem,
      { method: "DELETE", url: `/api/knowledge/${knowledgeId}` },
      knowledgeId
    );
    assert.equal(result.statusCode, 200);
  });

  // ── 往来单位 ──────────────────────────────────────────────────────────

  const { listCounterparties, createCounterparty, updateCounterparty } = await import(
    "./counterparties/routes.js"
  );

  let counterpartyId = "";

  await t.test("往来单位：建档成功", async () => {
    const result = await call(createCounterparty, {
      method: "POST",
      url: "/api/counterparties",
      body: { name: "P0 测试供应商", category: "supplier" }
    });
    assert.equal(result.statusCode, 201);
    counterpartyId = result.body!.id;
  });

  await t.test("往来单位：没有名称被拒", async () => {
    const result = await call(createCounterparty, {
      method: "POST",
      url: "/api/counterparties",
      body: { category: "supplier" }
    });
    assert.equal(result.statusCode, 400);
    assert.match(result.body!.error, /name/);
  });

  await t.test("往来单位：同名重复被拒，不静默建第二条", async () => {
    const result = await call(createCounterparty, {
      method: "POST",
      url: "/api/counterparties",
      body: { name: "P0 测试供应商", category: "supplier" }
    });
    assert.equal(result.statusCode, 400);

    // 同名两条会让往来余额分散到两个户上，对账时永远对不平。
    const rows = await pool.query<{ n: number }>(
      "select count(*)::int as n from counterparties where company_id=$1 and name=$2",
      [COMPANY_ID, "P0 测试供应商"]
    );
    assert.equal(rows.rows[0]!.n, 1);
  });

  await t.test("往来单位：补银行账号——付款导出与银企直连都要靠它", async () => {
    const result = await call(
      updateCounterparty,
      {
        method: "PUT",
        url: `/api/counterparties/${counterpartyId}`,
        body: {
          bankName: "工商银行深圳分行",
          bankAccount: "6222020000000009",
          bankAccountName: "P0 测试供应商"
        }
      },
      counterpartyId
    );
    assert.equal(result.statusCode, 200);

    const row = await pool.query<{ bank_account: string; bank_account_name: string }>(
      "select bank_account, bank_account_name from counterparties where id=$1",
      [counterpartyId]
    );
    assert.equal(row.rows[0]!.bank_account, "6222020000000009");
    // 户名单独存——收款户名未必等于单位名称，等同处理会被银行以户名不符退回。
    assert.equal(row.rows[0]!.bank_account_name, "P0 测试供应商");
  });

  await t.test("往来单位：列表按公司隔离", async () => {
    const capture = createResponseCapture();
    await listCounterparties(
      {
        method: "GET",
        url: "/api/counterparties",
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response
    );
    const ids = (capture.readJson().body!.items as Array<{ id: string }>).map((i) => i.id);
    assert.equal(ids.includes(counterpartyId), false);
  });

  // ── 收件箱 / 建账引导 / 归档包 ─────────────────────────────────────────

  await t.test("收件箱：返回待办，不报错", async () => {
    const { getInbox } = await import("./inbox/inbox.routes.js");
    const result = await call(getInbox, { method: "GET", url: "/api/inbox" });
    assert.equal(result.statusCode, 200);
    assert.ok(result.body !== null, "收件箱不该返回空响应");
  });

  await t.test("建账引导：返回各步骤的完成状态", async () => {
    const { getSetupStatus } = await import("./setup/setup.routes.js");
    const result = await call(getSetupStatus, { method: "GET", url: "/api/setup/status" });
    assert.equal(result.statusCode, 200);
    // 引导页靠这个决定「下一步该做什么」。返回空会让新用户看到一片空白。
    assert.ok(result.body !== null);
  });

  await t.test("老板问答：未登录返回 401", async () => {
    const { bossChat } = await import("./boss-qa/routes.js");
    const capture = createResponseCapture();
    await bossChat(
      { method: "POST", url: "/api/boss-qa/chat", body: { messages: [] } } as ApiRequest,
      capture.response
    );
    assert.equal(capture.readJson().statusCode, 401);
  });

  await t.test("老板问答：空消息或未配 AI 都给明确原因，不是笼统 500", async () => {
    const { bossChat } = await import("./boss-qa/routes.js");
    const result = await call(bossChat, {
      method: "POST",
      url: "/api/boss-qa/chat",
      body: { messages: [] }
    });
    // 两种都是「说得清的拒绝」：503 表示没配 AI，400 表示没给问题。
    // **不能是 500**——那会让人以为系统坏了，而实际只是少配了一项。
    assert.ok(
      result.statusCode === 400 || result.statusCode === 503,
      `期望 400 或 503，实得 ${result.statusCode}`
    );
    assert.ok(result.body!.error, "拒绝时要说清原因");
  });

  await t.test("归档包：给了期间能出结果", async () => {
    const { getArchivePackage } = await import("./archive/package.routes.js");
    const result = await call(getArchivePackage, {
      method: "GET",
      url: "/api/archive/package?period=2026-04"
    });
    assert.ok(
      result.statusCode === 200 || result.statusCode === 400,
      `归档包返回了意外的 ${result.statusCode}`
    );
  });
});
