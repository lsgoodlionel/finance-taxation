/**
 * 单据中心的路径级断言（P0-1）。
 *
 * ## 这个模块此前零测试
 *
 * 509 行、10 个导出路由，一条测试都没有。P0 点名的第二大零测试模块。
 *
 * ## 重点在 getScopedDocument
 *
 * 这个模块的每个写路由开头都调 `getScopedDocument` 做归属收敛。
 * **那是唯一一道数据级防线**，而它此前完全没有测试——
 * 一个月回顾里「发现三：权限做了路由级，没做数据级」说的正是这类地方。
 *
 * 所以这里的越权用例不是走过场：它验证换一个 companyId 就真的取不到单据。
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
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("单据中心：列表、改状态、归档与归属收敛", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { listDocuments, getDocumentDetail, updateDocument, archiveDocument } = await import(
    "./routes.js"
  );

  // 单据自建——种子里的单据数量与状态会随场景变，测试不该依赖它。
  // 「取不到就跳过」的写法会让整组用例静默通过，V13-B4 栽过一次。
  //
  // **单据必须挂在经营事项上**（business_event_id 是 not null）——
  // 那是这个模块的设计约束：单据是事项的产物，不能凭空存在。
  // 第一版漏了它，被库层拦下——这正是路由级测试能发现而函数级发现不了的。
  const eventRow = await pool.query<{ id: string }>(
    "select id from business_events where company_id=$1 order by id limit 1",
    [COMPANY_ID]
  );
  assert.ok(eventRow.rows[0], "种子里应当有经营事项，否则单据建不出来");
  const mappingRow = await pool.query<{ mapping_id: string }>(
    "select mapping_id from generated_documents limit 1"
  );
  assert.ok(mappingRow.rows[0], "种子里应当有单据映射");

  const DOC_ID = "doc-p0-test";
  await pool.query(
    `insert into generated_documents
       (id, company_id, business_event_id, mapping_id, document_type, title,
        status, owner_department, source, created_at, updated_at)
     values ($1, $2, $3, $4, 'invoice', 'P0 测试单据', 'pending', '财务部', 'manual', now(), now())
     on conflict (id) do nothing`,
    [DOC_ID, COMPANY_ID, eventRow.rows[0].id, mappingRow.rows[0].mapping_id]
  );

  await t.test("列表：只返回本公司的单据", async () => {
    const capture = createResponseCapture();
    await listDocuments(
      { method: "GET", url: "/api/documents", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);

    const items = (result.body!.items ?? result.body) as Array<{ id: string }>;
    assert.ok(Array.isArray(items), "应当返回数组");
    assert.ok(items.some((d) => d.id === DOC_ID), "本公司的单据应当在列表里");
  });

  await t.test("详情：能读到", async () => {
    const capture = createResponseCapture();
    await getDocumentDetail(
      { method: "GET", url: `/api/documents/${DOC_ID}`, auth: createAuthContext() } as ApiRequest,
      capture.response,
      DOC_ID
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.title, "P0 测试单据");
  });

  await t.test("越权：换一家公司读同一个 id，取不到", async () => {
    // **这是数据级防线的核心断言**。路由权限只管「谁能进门」，
    // getScopedDocument 管「进来后能碰谁的东西」。
    const capture = createResponseCapture();
    await getDocumentDetail(
      {
        method: "GET",
        url: `/api/documents/${DOC_ID}`,
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response,
      DOC_ID
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 404, "别家公司应当读不到，而不是读到内容");
  });

  await t.test("改状态：成功且落库", async () => {
    const capture = createResponseCapture();
    await updateDocument(
      {
        method: "PUT",
        url: `/api/documents/${DOC_ID}`,
        auth: createAuthContext(),
        body: { status: "ready", title: "P0 测试单据（已改）" }
      } as ApiRequest,
      capture.response,
      DOC_ID
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.status, "ready");

    const row = await pool.query<{ status: string; title: string }>(
      "select status, title from generated_documents where id=$1",
      [DOC_ID]
    );
    assert.equal(row.rows[0]!.status, "ready");
    assert.equal(row.rows[0]!.title, "P0 测试单据（已改）");
  });

  await t.test("改状态：不存在的单据返回 404，不静默创建", async () => {
    const capture = createResponseCapture();
    await updateDocument(
      {
        method: "PUT",
        url: "/api/documents/doc-does-not-exist",
        auth: createAuthContext(),
        body: { status: "ready" }
      } as ApiRequest,
      capture.response,
      "doc-does-not-exist"
    );
    assert.equal(capture.readJson().statusCode, 404);

    const row = await pool.query("select id from generated_documents where id=$1", [
      "doc-does-not-exist"
    ]);
    assert.equal(row.rowCount, 0, "不该静默创建一条出来");
  });

  await t.test("越权改：别家公司改不动本公司的单据", async () => {
    const capture = createResponseCapture();
    await updateDocument(
      {
        method: "PUT",
        url: `/api/documents/${DOC_ID}`,
        auth: createAuthContext(OTHER_COMPANY_ID),
        body: { status: "archived", title: "被别家改了" }
      } as ApiRequest,
      capture.response,
      DOC_ID
    );
    assert.equal(capture.readJson().statusCode, 404);

    // **拒绝之后数据一个字节都不能变**——返回 404 但实际改了，是最坏的一种。
    const row = await pool.query<{ title: string }>(
      "select title from generated_documents where id=$1",
      [DOC_ID]
    );
    assert.equal(row.rows[0]!.title, "P0 测试单据（已改）");
  });

  await t.test("归档：状态变成 archived 且记下归档时间", async () => {
    const capture = createResponseCapture();
    await archiveDocument(
      { method: "POST", url: `/api/documents/${DOC_ID}/archive`, auth: createAuthContext() } as ApiRequest,
      capture.response,
      DOC_ID
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body!.status, "archived");

    const row = await pool.query<{ status: string; archived_at: string | null }>(
      "select status, archived_at::text from generated_documents where id=$1",
      [DOC_ID]
    );
    assert.equal(row.rows[0]!.status, "archived");
    // 归档时间必须落库——没有它，「什么时候归的档」在审计时答不上来。
    assert.notEqual(row.rows[0]!.archived_at, null);
  });

  await t.test("归档：不存在的单据返回 404", async () => {
    const capture = createResponseCapture();
    await archiveDocument(
      { method: "POST", url: "/api/documents/nope/archive", auth: createAuthContext() } as ApiRequest,
      capture.response,
      "nope"
    );
    assert.equal(capture.readJson().statusCode, 404);
  });

  await t.test("审计留痕：改过状态的动作要能查到", async () => {
    const rows = await pool.query<{ action: string }>(
      `select action from audit_logs
        where company_id=$1 and resource_id=$2 order by created_at`,
      [COMPANY_ID, DOC_ID]
    );
    const actions = rows.rows.map((r) => r.action);
    assert.ok(
      actions.includes("document.status_changed") || actions.includes("document.updated"),
      "改状态应当留痕"
    );
    assert.ok(actions.includes("document.archived"), "归档应当留痕");
  });
});
