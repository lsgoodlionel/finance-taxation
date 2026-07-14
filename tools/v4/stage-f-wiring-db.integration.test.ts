import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetTestDatabase } from "./reset-test-db.js";
import { GENESIS_HASH, hashRecord, verifyChain } from "../../apps/api/src/security/hash-chain.js";
import type { ChainedRecord } from "../../apps/api/src/security/hash-chain.js";

/**
 * F1–F6 接线的真实 DB 端到端验证：migration 036（审计 hash 链）、037（API 凭证）、
 * 038（调度任务队列）+ F5 runner processDueJobs。以测试库真实执行，证明迁移与
 * 纯核心接线在 Postgres 上正确工作。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const admin = new pg.Pool({ connectionString: databaseUrl });
const COMPANY = "cmp-stagef";
let reachable = false;

type AuditMod = typeof import("../../apps/api/src/services/audit.js");
type RunnerMod = typeof import("../../apps/api/src/modules/jobs/runner.js");
type CredMod = typeof import("../../apps/api/src/security/api-credentials.js");
type ClientMod = typeof import("../../apps/api/src/db/client.js");
type TenantMod = typeof import("../../apps/api/src/db/tenant.js");
let auditMod: AuditMod;
let runnerMod: RunnerMod;
let credMod: CredMod;
let clientMod: ClientMod;
let tenantMod: TenantMod;

interface AuditRow {
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Record<string, unknown> | null;
  prev_hash: string | null;
  entry_hash: string | null;
}

function rebuildChain(rows: readonly AuditRow[]): ChainedRecord[] {
  return rows.map((row, index) => ({
    seq: index,
    payload: auditMod.buildAuditPayload({
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      changes: row.changes
    }),
    prevHash: row.prev_hash ?? GENESIS_HASH,
    hash: row.entry_hash as string
  }));
}

async function readAuditRows(): Promise<AuditRow[]> {
  const r = await admin.query<AuditRow>(
    `select action, resource_type, resource_id, changes, prev_hash, entry_hash
       from audit_logs where company_id = $1 order by created_at asc, id asc`,
    [COMPANY]
  );
  return r.rows;
}

before(async () => {
  try {
    await admin.query("select 1");
    reachable = true;
  } catch {
    reachable = false;
    return;
  }
  await resetTestDatabase(databaseUrl);
  process.env.DATABASE_URL = databaseUrl; // must precede the dynamic imports below
  auditMod = await import("../../apps/api/src/services/audit.js");
  runnerMod = await import("../../apps/api/src/modules/jobs/runner.js");
  credMod = await import("../../apps/api/src/security/api-credentials.js");
  clientMod = await import("../../apps/api/src/db/client.js");
  tenantMod = await import("../../apps/api/src/db/tenant.js");
  await admin.query("insert into companies (id, name) values ($1, 'Stage F 测试') on conflict do nothing", [COMPANY]);
});

after(async () => {
  if (clientMod) await clientMod.closePool();
  await admin.end();
});

test("036: writeAudit builds a tamper-evident hash chain", async (t) => {
  if (!reachable) {
    t.skip(`skipped: cannot reach ${databaseUrl}`);
    return;
  }
  auditMod.writeAudit({ companyId: COMPANY, action: "test.one", resourceType: "thing", resourceId: "r1", changes: { a: 1 } });
  auditMod.writeAudit({ companyId: COMPANY, action: "test.two", resourceType: "thing", resourceId: "r2", changes: { b: 2 } });
  await auditMod.drainAuditQueues();

  const rows = await readAuditRows();
  assert.equal(rows.length, 2, "both audit entries persisted");
  assert.equal(rows[0]!.prev_hash, GENESIS_HASH, "first row chains from genesis");
  assert.equal(rows[1]!.prev_hash, rows[0]!.entry_hash, "second row chains from the first");

  const p0 = auditMod.buildAuditPayload({
    action: rows[0]!.action,
    resourceType: rows[0]!.resource_type,
    resourceId: rows[0]!.resource_id,
    changes: rows[0]!.changes
  });
  assert.equal(rows[0]!.entry_hash, hashRecord(GENESIS_HASH, p0), "stored hash is reproducible");
  assert.equal(verifyChain(rebuildChain(rows)).valid, true, "intact chain verifies");
});

test("036: tampering a logged row breaks chain verification", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await admin.query("update audit_logs set changes = $1 where company_id = $2 and action = 'test.one'", [
    JSON.stringify({ a: 999 }),
    COMPANY
  ]);
  const result = verifyChain(rebuildChain(await readAuditRows()));
  assert.equal(result.valid, false, "tampered payload no longer matches its stored hash");
});

test("037: api_credentials stores only the hash and verifies keys", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  const { key, hash } = credMod.generateApiKey();
  await admin.query(
    "insert into api_credentials (id, company_id, name, key_prefix, key_hash) values ('ak1', $1, '测试', $2, $3)",
    [COMPANY, key.slice(0, 8), hash]
  );
  const row = (await admin.query<{ key_hash: string }>("select key_hash from api_credentials where id = 'ak1'")).rows[0];
  assert.equal(row!.key_hash, hash, "hash persisted");
  assert.notEqual(row!.key_hash, key, "plaintext key is never stored");
  assert.equal(credMod.verifyApiKey(key, row!.key_hash), true, "correct key verifies");
  assert.equal(credMod.verifyApiKey("ftk_wrong", row!.key_hash), false, "wrong key rejected");
});

test("038: scheduler runs a due job to completion", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await admin.query(
    `insert into scheduled_jobs (id, company_id, kind, status, run_at, attempts, max_attempts)
     values ('job-ok', $1, 'overdue_task_scan', 'pending', now() - interval '1 minute', 0, 5)`,
    [COMPANY]
  );
  const processed = await runnerMod.processDueJobs(Date.now());
  assert.ok(processed >= 1, "at least one due job processed");
  const row = (await admin.query<{ status: string }>("select status from scheduled_jobs where id = 'job-ok'")).rows[0];
  assert.equal(row!.status, "completed");
});

test("038: an unknown job kind goes to the dead-letter state", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await admin.query(
    `insert into scheduled_jobs (id, company_id, kind, status, run_at, attempts, max_attempts)
     values ('job-bad', $1, 'no_such_kind', 'pending', now() - interval '1 minute', 0, 5)`,
    [COMPANY]
  );
  await runnerMod.processDueJobs(Date.now());
  const row = (await admin.query<{ status: string }>("select status from scheduled_jobs where id = 'job-bad'")).rows[0];
  assert.equal(row!.status, "dead");
});

test("F8 ALS: global query() inside withTenantRequest carries the tenant context", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  // withTenantRequest 设置事务级 app.current_company 并放入 ALS；此后 global query()
  // 应透明改用该连接 —— 若未改用，current_setting 会是空。
  const inside = await tenantMod.withTenantRequest(COMPANY, async () => {
    const rows = await clientMod.query<{ c: string | null }>(
      "select current_setting('app.current_company', true) as c"
    );
    // withTransaction 也应复用同一租户连接（不另起 BEGIN）。
    const tx = await clientMod.withTransaction(async (client) => {
      const r = await client.query<{ c: string | null }>(
        "select current_setting('app.current_company', true) as c"
      );
      return r.rows[0]?.c ?? "";
    });
    return { direct: rows[0]?.c ?? "", viaTx: tx };
  });
  assert.equal(inside.direct, COMPANY, "global query() 命中租户连接");
  assert.equal(inside.viaTx, COMPANY, "withTransaction 复用租户连接");

  // 上下文之外，无 app.current_company（回退连接池）。
  const outside = await clientMod.query<{ c: string | null }>(
    "select current_setting('app.current_company', true) as c"
  );
  assert.equal(outside[0]?.c ?? "", "", "上下文外无租户设置");
});

test("038: a recurring job reschedules into the future after success", async (t) => {
  if (!reachable) {
    t.skip("db unreachable");
    return;
  }
  await admin.query(
    `insert into scheduled_jobs (id, company_id, kind, status, run_at, attempts, max_attempts, recurring_interval_ms)
     values ('job-rec', $1, 'overdue_task_scan', 'pending', now() - interval '1 minute', 0, 5, 60000)`,
    [COMPANY]
  );
  await runnerMod.processDueJobs(Date.now());
  const row = (await admin.query<{ status: string; run_at: string }>(
    "select status, run_at from scheduled_jobs where id = 'job-rec'"
  )).rows[0];
  assert.equal(row!.status, "pending", "recurring job stays pending");
  assert.ok(new Date(row!.run_at).getTime() > Date.now(), "next run scheduled in the future");
});
