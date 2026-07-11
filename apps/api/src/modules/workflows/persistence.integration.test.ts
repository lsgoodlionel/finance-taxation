import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const TEST_DATABASE_URL =
  process.env.V4_TEST_DATABASE_URL ||
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

const COMPANY_ID = "cmp-tech-001";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const migrationsDir = resolve(repoRoot, "migrations");

async function canConnectToTestDatabase(databaseUrl: string): Promise<boolean> {
  try {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query("select 1");
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

function assertSafeTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("V4_TEST_DATABASE_URL must be a valid database URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to reset non-test database: ${databaseName || "<empty>"}`);
  }
}

async function resetTestDatabase(databaseUrl: string): Promise<void> {
  assertSafeTestDatabase(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.query(`
      CREATE TABLE schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error(`No SQL migrations found in ${migrationsDir}`);
    }

    for (const file of migrationFiles) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(await readFile(resolve(migrationsDir, file), "utf8"));
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

test("workflow persistence integration covers write/read/retry/compensation", async (t) => {
  if (!(await canConnectToTestDatabase(TEST_DATABASE_URL))) {
    t.skip(`workflow integration test skipped: cannot reach ${TEST_DATABASE_URL}`);
    return;
  }

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await resetTestDatabase(TEST_DATABASE_URL);

  const { closePool, withTransaction } = await import("../../db/client.js");
  const persistence = await import("./persistence.js");
  const commands = await import("./commands.js");
  const runtime = await import("./runtime.js");

  const runSeed = commands.buildWorkflowRun({
    companyId: COMPANY_ID,
    workflowKey: "integration.workflow",
    resourceType: "generic",
    resourceId: "resource-1",
    resourceLabel: "Integration Resource",
    currentState: "draft",
    initiatorUserId: "usr-fin-001",
    initiatorName: "finance"
  });

  await withTransaction(async (client) => {
    const run = await persistence.ensureWorkflowRun(client, runSeed);
    assert.equal(run.resourceId, "resource-1");

    const transition = runtime.buildWorkflowTransitionRecord({
      companyId: run.companyId,
      workflowRunId: run.id,
      resourceType: run.resourceType,
      resourceId: run.resourceId,
      previousState: "draft",
      nextState: "ready_for_review",
      actorUserId: "usr-fin-001",
      actorName: "finance",
      basis: "integration.test",
      ruleVersion: "v4-it"
    });
    await persistence.insertWorkflowTransition(client, transition);
    await persistence.updateWorkflowRunState(client, run.id, "ready_for_review", null, transition.occurredAt);

    const queuedCommand = commands.buildWorkflowCommandExecution({
      companyId: run.companyId,
      workflowRunId: run.id,
      commandType: "integration.execute",
      resourceType: run.resourceType,
      resourceId: run.resourceId,
      idempotencyKey: "integration:resource-1:v1",
      objectVersion: "v1",
      inputSnapshot: { amount: 100 },
      retryPolicy: { maxAttempts: 3, backoffMinutes: 15 },
      timeoutPolicy: { timeoutSeconds: 120 },
      initiatorUserId: "usr-fin-001",
      initiatorName: "finance",
      executorUserId: "usr-fin-001",
      executorName: "finance",
      authorizerUserId: "usr-chairman-001",
      authorizerName: "chairman",
      createdAt: "2026-06-25T10:00:00.000Z"
    });

    const runningCommand = commands.markWorkflowCommandStatus(queuedCommand, "running", {
      progress: "running",
      updatedAt: "2026-06-25T10:05:00.000Z"
    });
    await persistence.insertWorkflowCommandExecution(client, runningCommand);

    const failedCommand = commands.markWorkflowCommandStatus(runningCommand, "failed", {
      progress: "failed",
      lastErrorCode: "INTEGRATION_TIMEOUT",
      lastErrorDetail: "upstream timeout",
      nextRetryAt: "2026-06-25T10:20:00.000Z",
      updatedAt: "2026-06-25T10:06:00.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, failedCommand);

    const compensation = commands.buildWorkflowCompensationRecord({
      companyId: run.companyId,
      workflowRunId: run.id,
      commandExecutionId: queuedCommand.id,
      actionType: "manual_takeover",
      reason: "integration timeout requires human follow-up",
      handoffToUserId: "usr-chairman-001",
      handoffToName: "chairman",
      createdAt: "2026-06-25T10:07:00.000Z"
    });
    await persistence.insertWorkflowCompensationRecord(client, compensation);

    const retryQueued = commands.markWorkflowCommandStatus(failedCommand, "waiting", {
      progress: "retry queued",
      nextRetryAt: "2026-06-25T10:21:00.000Z",
      updatedAt: "2026-06-25T10:07:30.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, retryQueued);

    const retryRunning = commands.markWorkflowCommandStatus(retryQueued, "running", {
      progress: "retry running",
      updatedAt: "2026-06-25T10:21:00.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, retryRunning);

    const retrySucceeded = commands.markWorkflowCommandStatus(retryRunning, "succeeded", {
      progress: "done",
      resultSnapshot: { voucherId: "vch-001", status: "posted" },
      updatedAt: "2026-06-25T10:22:00.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, retrySucceeded);

    const secondQueued = commands.buildWorkflowCommandExecution({
      companyId: run.companyId,
      workflowRunId: run.id,
      commandType: "integration.secondary",
      resourceType: run.resourceType,
      resourceId: run.resourceId,
      idempotencyKey: "integration:resource-1:v2",
      objectVersion: "v2",
      inputSnapshot: { amount: 200 },
      retryPolicy: { maxAttempts: 2, backoffMinutes: 10 },
      timeoutPolicy: { timeoutSeconds: 180 },
      initiatorUserId: "usr-fin-001",
      initiatorName: "finance",
      executorUserId: "usr-fin-001",
      executorName: "finance",
      createdAt: "2026-06-25T11:00:00.000Z"
    });
    await persistence.insertWorkflowCommandExecution(client, secondQueued);

    const secondRunning = commands.markWorkflowCommandStatus(secondQueued, "running", {
      progress: "running",
      updatedAt: "2026-06-25T11:01:00.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, secondRunning);

    const secondFailed = commands.markWorkflowCommandStatus(secondRunning, "failed", {
      progress: "failed",
      lastErrorCode: "SECONDARY_TIMEOUT",
      lastErrorDetail: "secondary upstream timeout",
      nextRetryAt: "2026-06-25T11:12:00.000Z",
      updatedAt: "2026-06-25T11:02:00.000Z"
    });
    await persistence.updateWorkflowCommandExecution(client, secondFailed);
  });

  const runs = await persistence.listWorkflowRuns(COMPANY_ID, {
    resourceType: "generic",
    resourceId: "resource-1"
  });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.currentState, "ready_for_review");

  const detail = await persistence.getWorkflowRunDetail(COMPANY_ID, runs[0]!.id);
  assert.ok(detail);
  assert.equal(detail?.transitions.length, 1);
  assert.equal(detail?.transitions[0]?.nextState, "ready_for_review");
  assert.equal(detail?.commands.length, 2);
  assert.equal(detail?.commands[0]?.status, "failed");
  assert.equal(detail?.commands[0]?.attemptCount, 1);
  assert.equal(detail?.commands[0]?.lastErrorCode, "SECONDARY_TIMEOUT");
  assert.equal(detail?.commands[1]?.status, "succeeded");
  assert.equal(detail?.commands[1]?.attemptCount, 2);
  assert.equal(detail?.commands[1]?.resultSnapshot?.status, "posted");
  assert.equal(detail?.compensations.length, 1);
  assert.equal(detail?.compensations[0]?.actionType, "manual_takeover");

  const commandDetail = await persistence.getWorkflowCommandDetail(COMPANY_ID, detail!.commands[1]!.id);
  assert.ok(commandDetail);
  assert.equal(commandDetail?.run?.resourceId, "resource-1");
  assert.equal(commandDetail?.compensations.length, 1);

  const retryableFailed = commands.canRetryWorkflowCommand(detail!.commands[0]!);
  assert.equal(retryableFailed, true);

  const retryableSucceeded = commands.canRetryWorkflowCommand(detail!.commands[1]!);
  assert.equal(retryableSucceeded, false);

  const reusableSucceeded = await persistence.findSuccessfulWorkflowCommandExecution(COMPANY_ID, {
    commandType: "integration.execute",
    resourceType: "generic",
    resourceId: "resource-1",
    idempotencyKey: "integration:resource-1:v1",
    objectVersion: "v1"
  });
  assert.ok(reusableSucceeded);
  assert.equal(reusableSucceeded?.status, "succeeded");
  assert.equal(reusableSucceeded?.attemptCount, 2);

  const reusableFailed = await persistence.findSuccessfulWorkflowCommandExecution(COMPANY_ID, {
    commandType: "integration.secondary",
    resourceType: "generic",
    resourceId: "resource-1",
    idempotencyKey: "integration:resource-1:v2",
    objectVersion: "v2"
  });
  assert.equal(reusableFailed, null);

  await closePool();
});
