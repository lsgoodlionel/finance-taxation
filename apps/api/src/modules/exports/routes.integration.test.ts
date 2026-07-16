import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";
const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    companyId: "cmp-v4-tech",
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-accountant"],
    token: "test-token",
    ...overrides
  };
}

function createResponseCapture() {
  let statusCode = 200;
  let body = "";

  const response = {
    writeHead(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return response;
    },
    end(chunk?: string) {
      if (chunk) {
        body += chunk;
      }
      return response;
    }
  } as unknown as ServerResponse;

  return {
    response,
    readJson<T>() {
      return {
        statusCode,
        body: body ? (JSON.parse(body) as T) : null
      };
    }
  };
}

async function prepareDatabase() {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("createExportJob reuses the same opened job and keeps a single persisted object", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { createExportJob } = await import("./routes.js");
    const { listAuditLogs } = await import("../audit/routes.js");
    const { closePool } = await import("../../db/client.js");

    const payload = {
      kind: "report" as const,
      label: "2026-05 利润表 PDF",
      fileName: "profit-statement-2026-05.pdf",
      resourceType: "report_snapshot",
      resourceId: "snapshot-2026-05",
      periodLabel: "2026-05",
      status: "opened" as const
    };

    const firstCapture = createResponseCapture();
    await createExportJob(
      {
        method: "POST",
        url: "/api/exports/jobs",
        auth: createAuthContext(),
        body: payload
      } as ApiRequest,
      firstCapture.response
    );
    const firstCreated = firstCapture.readJson<{
      job: { id: string };
      archiveEntry: { jobId: string };
      reused: boolean;
    }>();

    const secondCapture = createResponseCapture();
    await createExportJob(
      {
        method: "POST",
        url: "/api/exports/jobs",
        auth: createAuthContext(),
        body: payload
      } as ApiRequest,
      secondCapture.response
    );
    const secondCreated = secondCapture.readJson<{
      job: { id: string };
      archiveEntry: { jobId: string };
      reused: boolean;
    }>();

    assert.equal(firstCreated.statusCode, 201);
    assert.equal(firstCreated.body?.reused, false);
    assert.equal(secondCreated.statusCode, 200);
    assert.equal(secondCreated.body?.reused, true);
    assert.equal(secondCreated.body?.job.id, firstCreated.body?.job.id);
    assert.equal(secondCreated.body?.archiveEntry.jobId, firstCreated.body?.job.id);

    const counts = await pool.query<{ jobs: string; archives: string }>(
      `select
         (select count(*)::text from export_jobs where company_id = $1) as jobs,
         (select count(*)::text from export_archive_entries where company_id = $1) as archives`,
      ["cmp-v4-tech"]
    );
    assert.equal(Number(counts.rows[0]?.jobs ?? 0), 1);
    assert.equal(Number(counts.rows[0]?.archives ?? 0), 1);

    // writeAudit 是 fire-and-forget（services/audit.ts:query(...).catch()），审计插入
    // 与本查询存在竞态，偶发只查到 'create' 而 'reuse' 未落库。与下方 updateExportJobStatus
    // 用例同款轮询直到两条审计动作齐全，消除该 flaky（审计不阻塞业务，测试侧等待收敛）。
    let auditItems: Array<{ action: string; resourceId: string | null }> = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const auditCapture = createResponseCapture();
      await listAuditLogs(
        {
          method: "GET",
          url: `/api/audit/logs?resourceType=export_job&resourceId=${firstCreated.body?.job.id}&limit=10`,
          auth: createAuthContext()
        } as ApiRequest,
        auditCapture.response
      );
      const auditList = auditCapture.readJson<{
        items: Array<{ action: string; resourceId: string | null }>;
      }>();
      auditItems = auditList.body?.items ?? [];
      if (auditItems.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.deepEqual(
      auditItems.map((item) => item.action),
      ["reuse", "create"]
    );

    await closePool();
  } finally {
    await pool.end();
  }
});

test("updateExportJobStatus records retry metadata and audit trail for failed then reopened exports", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { createExportJob, updateExportJobStatus } = await import("./routes.js");
    const { listAuditLogs } = await import("../audit/routes.js");
    const { closePool } = await import("../../db/client.js");

    const createCapture = createResponseCapture();
    await createExportJob(
      {
        method: "POST",
        url: "/api/exports/jobs",
        auth: createAuthContext(),
        body: {
          kind: "package",
          label: "审计资料包 2026-Q2",
          fileName: "audit-package-2026-q2.pdf",
          resourceType: "closing_bundle",
          resourceId: "audit:2026-Q2",
          periodLabel: "2026-Q2",
          status: "opened"
        }
      } as ApiRequest,
      createCapture.response
    );
    const created = createCapture.readJson<{ job: { id: string } }>();
    const jobId = created.body?.job.id ?? "";

    const failedCapture = createResponseCapture();
    await updateExportJobStatus(
      {
        method: "POST",
        url: `/api/exports/jobs/${jobId}/status`,
        auth: createAuthContext(),
        body: {
          status: "failed",
          errorMessage: "归档索引写入失败，等待重试"
        }
      } as ApiRequest,
      failedCapture.response,
      jobId
    );
    const failed = failedCapture.readJson<{
      job: { status: string; retryCount: number; lastError: string | null; nextRetryAt: string | null };
    }>();

    assert.equal(failed.body?.job.status, "failed");
    assert.equal(failed.body?.job.retryCount, 0);
    assert.equal(failed.body?.job.lastError, "归档索引写入失败，等待重试");
    assert.equal(typeof failed.body?.job.nextRetryAt, "string");

    const reopenedCapture = createResponseCapture();
    await updateExportJobStatus(
      {
        method: "POST",
        url: `/api/exports/jobs/${jobId}/status`,
        auth: createAuthContext(),
        body: { status: "opened" }
      } as ApiRequest,
      reopenedCapture.response,
      jobId
    );
    const reopened = reopenedCapture.readJson<{
      job: { status: string; retryCount: number; lastError: string | null; nextRetryAt: string | null };
    }>();

    assert.equal(reopened.body?.job.status, "opened");
    assert.equal(reopened.body?.job.retryCount, 1);
    assert.equal(reopened.body?.job.lastError, null);
    assert.equal(reopened.body?.job.nextRetryAt, null);

    const persisted = await pool.query<{
      status: string;
      retry_count: number;
      last_error: string | null;
      next_retry_at: string | null;
    }>(
      "select status, retry_count, last_error, next_retry_at from export_jobs where id = $1",
      [jobId]
    );
    assert.equal(persisted.rows[0]?.status, "opened");
    assert.equal(persisted.rows[0]?.retry_count, 1);
    assert.equal(persisted.rows[0]?.last_error, null);
    assert.equal(persisted.rows[0]?.next_retry_at, null);

    // writeAudit 是 fire-and-forget(services/audit.ts:query(...).catch()),审计插入
    // 与本查询存在竞态,偶发查不到刚写入的 'retry' 条目。轮询直到三条审计动作齐全,
    // 消除该 flaky(设计上审计不阻塞业务,故此处以测试侧等待收敛)。
    let auditItems: Array<{ action: string; changes: { retryCount?: number; lastError?: string | null } | null }> = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const auditCapture = createResponseCapture();
      await listAuditLogs(
        {
          method: "GET",
          url: `/api/audit/logs?resourceType=export_job&resourceId=${jobId}&limit=10`,
          auth: createAuthContext()
        } as ApiRequest,
        auditCapture.response
      );
      const auditList = auditCapture.readJson<{
        items: Array<{ action: string; changes: { retryCount?: number; lastError?: string | null } | null }>;
      }>();
      auditItems = auditList.body?.items ?? [];
      if (auditItems.length >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.deepEqual(
      auditItems.map((item) => item.action),
      ["retry", "update_status", "create"]
    );
    assert.equal(auditItems[0]?.changes?.retryCount, 1);
    assert.equal(auditItems[1]?.changes?.lastError, "归档索引写入失败，等待重试");

    await closePool();
  } finally {
    await pool.end();
  }
});
