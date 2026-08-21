/**
 * 报表快照溯源的路径级测试（V15/P1）。
 *
 * 判定逻辑本身有 `provenance.test.ts` 逐条钉住。这里验的是**整条路径**：
 * 生成快照时溯源信息真的落了库，之后账一动，列表接口真的报出「已过期」。
 *
 * 为什么这条必须走真库：口径对不上是这个功能最可能的失败方式——
 * 资产负债表是时点表（期末之前全部分录），利润表只取当期那一段。
 * 校验侧的 SQL 若与生成侧的取数范围不一致，每一份资产负债表快照都会
 * 被误报成「已过期」，而纯函数测试对此完全无感。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ReportSnapshot } from "@finance-taxation/domain-model";
import type { ApiRequest, AuthContext } from "../../types.js";
import type { SnapshotFreshness } from "./provenance.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const BUSINESS_EVENT_ID = "PUR-STD-001";
const DRAFT_ID = "snp-fixture-draft";
const VOUCHER_ID = "snp-fixture-voucher";

function createAuthContext(): AuthContext {
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
    readJson<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

type SnapshotRow = ReportSnapshot & { freshness?: SnapshotFreshness };

async function createSnapshot(reportType: string, year: number, month: number) {
  const { createReportSnapshot } = await import("./routes.js");
  const capture = createResponseCapture();
  await createReportSnapshot(
    {
      method: "POST",
      url: `/api/reports/snapshots?year=${year}&month=${month}`,
      body: { reportType, periodType: "month" },
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson<SnapshotRow>();
}

async function listSnapshots() {
  const { listReportSnapshots } = await import("./routes.js");
  const capture = createResponseCapture();
  await listReportSnapshots(
    { method: "GET", url: "/api/reports/snapshots", auth: createAuthContext() } as ApiRequest,
    capture.response
  );
  return capture.readJson<{ items: SnapshotRow[]; total: number }>();
}

function findSnapshot(items: SnapshotRow[], id: string): SnapshotRow {
  const found = items.find((item) => item.id === id);
  assert.ok(found, `列表里应当有快照 ${id}`);
  return found!;
}

async function seedEntry(pool: pg.Pool, id: string, date: string, amount: string): Promise<void> {
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, business_event_id, entry_date, summary,
       account_code, account_name, debit, credit, posted_at
     ) values ($1,$2,$3,$4,$5::date,'快照溯源夹具','6601','销售费用',$6::numeric,0,now())`,
    [id, COMPANY_ID, VOUCHER_ID, BUSINESS_EVENT_ID, date, amount]
  );
}

test("报表快照溯源：生成时落库，账变动后列表报出已过期", async (t) => {
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

  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1,$2,$3,'accrual','approved','快照溯源夹具草稿') on conflict (id) do nothing`,
    [DRAFT_ID, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, posted_at)
     values ($1,$2,$3,$4,'accrual','快照溯源夹具凭证','posted',now()) on conflict (id) do nothing`,
    [VOUCHER_ID, COMPANY_ID, BUSINESS_EVENT_ID, DRAFT_ID]
  );

  await seedEntry(pool, "snp-le-1", "2026-07-10", "100.00");
  await seedEntry(pool, "snp-le-2", "2026-07-20", "200.00");

  // ── 生成：溯源信息必须真的落库 ────────────────────────────────────────────
  const created = await createSnapshot("profit_statement", 2026, 7);
  assert.equal(created.statusCode, 201);
  const snapshotId = created.body!.id;

  const stored = await pool.query<{
    generated_by_user_id: string | null;
    source_entry_count: number | null;
    source_latest_posted_at: string | Date | null;
    period_start: string | Date | null;
    period_end: string | Date | null;
  }>(
    `select generated_by_user_id, source_entry_count, source_latest_posted_at, period_start, period_end
     from report_snapshots where id = $1`,
    [snapshotId]
  );
  const row = stored.rows[0]!;
  assert.equal(row.generated_by_user_id, "usr-v4-accountant", "要能回答『谁生成的』");
  assert.equal(row.source_entry_count, 2, "条数取的是纳入计算的分录");
  assert.ok(row.source_latest_posted_at, "数据截止时点不能为空");
  // date 列 pg 直接给字符串，统一成 ISO 前 10 位再比。
  const dateOf = (value: string | Date | null) =>
    value === null ? null : (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
  assert.equal(dateOf(row.period_start), "2026-07-01");
  assert.equal(dateOf(row.period_end), "2026-07-31");

  // ── 刚生成：是最新的 ──────────────────────────────────────────────────────
  const fresh = await listSnapshots();
  assert.equal(findSnapshot(fresh.body!.items, snapshotId).freshness?.status, "fresh");

  // ── 补一笔当期分录：必须被判定为已过期 ────────────────────────────────────
  // 这是最常见的场景：月结出完报表，有人又补一张本月凭证。
  await seedEntry(pool, "snp-le-3", "2026-07-25", "50.00");
  const afterPost = await listSnapshots();
  const stale = findSnapshot(afterPost.body!.items, snapshotId);
  assert.equal(stale.freshness?.status, "stale");
  assert.match(
    stale.freshness?.status === "stale" ? stale.freshness.reason : "",
    /新增了 1 条/,
    "要说清多了几条，用户才知道该不该重新生成"
  );

  // ── 期间之外的分录不影响利润表快照 ────────────────────────────────────────
  // 校验侧若少了下限，8 月的分录会把 7 月的快照误报成过期。
  const regenerated = await createSnapshot("profit_statement", 2026, 7);
  assert.equal(regenerated.statusCode, 201);
  await seedEntry(pool, "snp-le-4", "2026-08-03", "999.00");
  const afterNextMonth = await listSnapshots();
  assert.equal(
    findSnapshot(afterNextMonth.body!.items, snapshotId).freshness?.status,
    "fresh",
    "下月的分录不该让上月利润表快照失效"
  );

  // ── 资产负债表是时点表：以前期间补录也算变动 ──────────────────────────────
  const balanceSheet = await createSnapshot("balance_sheet", 2026, 7);
  assert.equal(balanceSheet.statusCode, 201);
  const bsId = balanceSheet.body!.id;
  const bsFresh = await listSnapshots();
  assert.equal(
    findSnapshot(bsFresh.body!.items, bsId).freshness?.status,
    "fresh",
    "资产负债表口径是期末之前全部分录，校验侧必须一致，否则一生成就报过期"
  );

  await seedEntry(pool, "snp-le-5", "2026-05-11", "77.00");
  const bsAfterBackdated = await listSnapshots();
  assert.equal(
    findSnapshot(bsAfterBackdated.body!.items, bsId).freshness?.status,
    "stale",
    "5 月补录改变了 7 月末的资产负债表，必须报出来"
  );

  // ── 老快照没有溯源信息：unknown，不是 fresh ───────────────────────────────
  // 给一份来路不明的报表打绿勾，比说「不知道」危险得多。
  await pool.query(
    `update report_snapshots set source_entry_count = null, source_latest_posted_at = null where id = $1`,
    [snapshotId]
  );
  const legacy = await listSnapshots();
  assert.equal(findSnapshot(legacy.body!.items, snapshotId).freshness?.status, "unknown");
});
