import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

/**
 * Proves the Stage C / C1 tenant-isolation mechanism end-to-end:
 * `set_config('app.current_company', ...)` + a Row-Level Security policy scope
 * every read/write to one tenant.
 *
 * IMPORTANT C1 constraint surfaced here: RLS is bypassed by superusers even with
 * FORCE, so the application must connect as a dedicated NON-superuser role. This
 * test provisions such a role and connects as it — mirroring what db/tenant.ts's
 * `withTenantContext` (same set_config pattern) will enforce once the app uses a
 * non-superuser connection.
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const admin = new pg.Pool({ connectionString: databaseUrl });
const APP_ROLE = "rls_test_app";
const APP_PASSWORD = "rls_test_app_pw";
let appPool: pg.Pool;

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

before(async () => {
  await admin.query("drop table if exists rls_demo");
  await admin.query(
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then
         create role ${APP_ROLE} login password '${APP_PASSWORD}';
       end if;
     end $$;`
  );
  await admin.query("create table rls_demo (id text primary key, company_id text not null, note text)");
  await admin.query("alter table rls_demo enable row level security");
  await admin.query("alter table rls_demo force row level security");
  await admin.query(
    `create policy rls_demo_tenant on rls_demo
       for all
       using (company_id = current_setting('app.current_company', true))
       with check (company_id = current_setting('app.current_company', true))`
  );
  await admin.query(`grant usage on schema public to ${APP_ROLE}`);
  await admin.query(`grant select, insert, update, delete on rls_demo to ${APP_ROLE}`);

  const appUrl = new URL(databaseUrl);
  appUrl.username = APP_ROLE;
  appUrl.password = APP_PASSWORD;
  appPool = new pg.Pool({ connectionString: appUrl.toString() });
});

after(async () => {
  if (appPool) await appPool.end();
  await admin.query("drop table if exists rls_demo");
  // Remove the role's remaining grants/dependencies before dropping it.
  await admin.query(`drop owned by ${APP_ROLE}`);
  await admin.query(`drop role if exists ${APP_ROLE}`);
  await admin.end();
});

test("tenant context scopes writes and reads to the current company", async () => {
  await runAs("cmp-a", (c) =>
    c.query("insert into rls_demo (id, company_id, note) values ('a1', 'cmp-a', 'alpha')")
  );
  await runAs("cmp-b", (c) =>
    c.query("insert into rls_demo (id, company_id, note) values ('b1', 'cmp-b', 'bravo')")
  );

  const aRows = await runAs("cmp-a", async (c) => {
    const r = await c.query<{ id: string }>("select id from rls_demo order by id");
    return r.rows.map((row) => row.id);
  });
  assert.deepEqual(aRows, ["a1"], "company A must only see its own rows");

  const bRows = await runAs("cmp-b", async (c) => {
    const r = await c.query<{ id: string }>("select id from rls_demo order by id");
    return r.rows.map((row) => row.id);
  });
  assert.deepEqual(bRows, ["b1"], "company B must only see its own rows");
});

test("a write for a different tenant is rejected by the RLS check", async () => {
  await assert.rejects(
    () =>
      runAs("cmp-a", (c) =>
        c.query("insert into rls_demo (id, company_id, note) values ('x', 'cmp-b', 'leak')")
      ),
    /row-level security/i
  );
});

test("without a tenant context no rows are visible (fails closed)", async () => {
  const client = await appPool.connect();
  try {
    const r = await client.query("select id from rls_demo");
    assert.equal(r.rows.length, 0, "no rows visible without app.current_company set");
  } finally {
    client.release();
  }
});
