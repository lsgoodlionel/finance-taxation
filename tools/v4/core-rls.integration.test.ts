import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetTestDatabase } from "./reset-test-db.js";

/**
 * F8 验证：migration 039 在真实 business_events 表上启用的 RLS + 租户策略确实生效。
 *
 * 关键约束（与设计文档一致）：RLS 对表属主不生效，故必须以【非属主角色】连接才能
 * 证明隔离。本测试以 owner 建角色 + 授权 + 播种公司，再以非属主角色在
 * set_config('app.current_company', ...) 事务内读写，验证隔离/拒写/fails-closed。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const admin = new pg.Pool({ connectionString: databaseUrl });
const APP_ROLE = "rls_core_app";
const APP_PASSWORD = "rls_core_app_pw";
let appPool: pg.Pool;
let reachable = false;

async function canConnect(): Promise<boolean> {
  try {
    await admin.query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function runAs<T>(companyId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.current_company', $1, true)", [companyId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function insertEvent(client: pg.PoolClient, id: string, companyId: string): Promise<unknown> {
  return client.query(
    `insert into business_events (id, company_id, type, title, occurred_on)
     values ($1, $2, 'expense', '事项', '2026-05-01')`,
    [id, companyId]
  );
}

before(async () => {
  reachable = await canConnect();
  if (!reachable) return;
  await resetTestDatabase(databaseUrl); // applies all migrations incl. 039 (RLS on business_events)

  await admin.query(
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then
         create role ${APP_ROLE} login password '${APP_PASSWORD}';
       end if;
     end $$;`
  );
  await admin.query(`grant usage on schema public to ${APP_ROLE}`);
  await admin.query(`grant select, insert, update, delete on business_events to ${APP_ROLE}`);
  await admin.query(
    "insert into companies (id, name) values ('cmp-a', 'A公司'), ('cmp-b', 'B公司') on conflict do nothing"
  );

  const appUrl = new URL(databaseUrl);
  appUrl.username = APP_ROLE;
  appUrl.password = APP_PASSWORD;
  appPool = new pg.Pool({ connectionString: appUrl.toString() });
});

after(async () => {
  if (appPool) await appPool.end();
  if (reachable) {
    await admin.query(`drop owned by ${APP_ROLE}`).catch(() => {});
    await admin.query(`drop role if exists ${APP_ROLE}`).catch(() => {});
  }
  await admin.end();
});

test("RLS scopes business_events reads/writes to the current tenant", async (t) => {
  if (!reachable) {
    t.skip(`skipped: cannot reach ${databaseUrl}`);
    return;
  }
  await runAs("cmp-a", (c) => insertEvent(c, "be-a", "cmp-a"));
  await runAs("cmp-b", (c) => insertEvent(c, "be-b", "cmp-b"));

  const aRows = await runAs("cmp-a", async (c) => {
    const r = await c.query<{ id: string }>("select id from business_events order by id");
    return r.rows.map((row) => row.id);
  });
  assert.deepEqual(aRows, ["be-a"], "company A must only see its own events");
});

test("a cross-tenant write is rejected by the RLS check", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await assert.rejects(
    () => runAs("cmp-a", (c) => insertEvent(c, "be-x", "cmp-b")),
    /row-level security/i
  );
});

test("without a tenant context no business_events are visible (fails closed)", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  const client = await appPool.connect();
  try {
    const r = await client.query("select id from business_events");
    assert.equal(r.rows.length, 0, "no rows visible without app.current_company set");
  } finally {
    client.release();
  }
});
