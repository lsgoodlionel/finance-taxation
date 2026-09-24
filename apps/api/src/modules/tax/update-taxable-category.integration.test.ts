/**
 * 事项建好之后还能改应税行为类别（V17 阶段二）。
 *
 * ## 为什么这条不能省
 *
 * 阶段二给了录入入口，但只在**建的时候**能选。标错了怎么办？
 * 事项一旦建好就可能已经派生了税项、生成了凭证——重建一笔的代价
 * 远大于改一个字段，而用户面对「只能重建」时的实际做法是**将错就错**，
 * 于是那笔业务一直按错的税率算下去。
 *
 * 录入入口和改正入口是一对，只给前者等于假设用户不会选错。
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

test("标错的应税行为类别可以改回来", async (t) => {
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

  const { createEvent, updateEvent } = await import("../events/routes.js");

  // 建一笔，类别标成「销售货物」（13%）——实际是咨询，应当是 6%。
  const createRes = capture();
  await createEvent(
    {
      method: "POST",
      url: "/api/events",
      body: {
        type: "sales",
        title: "咨询收入（类别标错了）",
        occurredOn: "2026-08-20",
        amount: "80000",
        taxableCategory: "goods"
      },
      auth: auth()
    } as ApiRequest,
    createRes.response
  );
  const eventId = createRes.read<{ id: string }>().body!.id;

  // ── 改成现代服务 ────────────────────────────────────────────────────────
  const fixRes = capture();
  await updateEvent(
    {
      method: "PUT",
      url: `/api/events/${eventId}`,
      body: { taxableCategory: "modern_service" },
      auth: auth()
    } as ApiRequest,
    fixRes.response,
    eventId
  );
  assert.equal(fixRes.read<unknown>().statusCode, 200, "改类别应当成功");

  const after = await pool.query<{ taxable_category: string | null }>(
    `select taxable_category from business_events where id = $1`,
    [eventId]
  );
  assert.equal(
    after.rows[0]!.taxable_category,
    "modern_service",
    "改过的类别要真的落库——否则用户以为改好了，底稿还按 13% 算"
  );

  // ── 不传这个字段时保持原样，不被清空 ────────────────────────────────────
  //
  // PUT 是整体更新，但前端改标题时不会把类别一起发上来。
  // 没传就当成「清空」的话，改一次标题会把税目标注抹掉。
  const titleOnly = capture();
  await updateEvent(
    {
      method: "PUT",
      url: `/api/events/${eventId}`,
      body: { title: "只改标题" },
      auth: auth()
    } as ApiRequest,
    titleOnly.response,
    eventId
  );
  const kept = await pool.query<{ taxable_category: string | null; title: string }>(
    `select taxable_category, title from business_events where id = $1`,
    [eventId]
  );
  assert.equal(kept.rows[0]!.title, "只改标题");
  assert.equal(
    kept.rows[0]!.taxable_category,
    "modern_service",
    "改标题不该把税目标注抹掉——没传等于没改，不等于清空"
  );

  // ── 认不出的类别照样被拒 ────────────────────────────────────────────────
  const bogus = capture();
  await updateEvent(
    {
      method: "PUT",
      url: `/api/events/${eventId}`,
      body: { taxableCategory: "卖空气" },
      auth: auth()
    } as ApiRequest,
    bogus.response,
    eventId
  );
  const bogusRead = bogus.read<{ code?: string }>();
  assert.equal(bogusRead.statusCode, 400, "改的时候也要挡住认不出的类别");
  assert.equal(bogusRead.body!.code, "TAXABLE_CATEGORY_INVALID");
});
