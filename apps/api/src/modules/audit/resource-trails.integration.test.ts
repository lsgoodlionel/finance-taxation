import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

/**
 * 三类对象的审计留痕回归：单据（document）、税务事项（tax_item）、风险发现（risk_finding）。
 *
 * 起因：全量扫描 apps/api 的 writeAudit() 调用点后发现这三类 resourceType 一条都不写，
 * 而前端的深链恰恰是按 `resourceType + resourceId` 去查 /audit 的
 * （apps/web/src/pages/drilldown.ts 的 buildRiskClosureTargetChain 与
 * resolveAuditContextFromState），跳过去永远是空列表——用户会读成
 * 「这个对象没人动过」，而事实是「这类对象根本不留痕」。
 *
 * 因此下面每个用例都按**深链真实使用的那组查询条件**去断言，而不是只数
 * audit_logs 的总行数：条数对了但 resource_id 对不上，深链一样是空的。
 *
 * 另外统一断言 entry_hash 非空。audit_logs 走哈希链，只有经 writeAudit 才会算链；
 * 图省事直接 insert 也能让「有记录」的断言变绿，但链就断了。
 */

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const OWNER_USER_ID = "usr-v4-accountant";
const EVENT_ID = "evt-audit-trail-001";
const VOUCHER_ID = "vch-audit-trail-001";
const ENTRY_DATE = "2026-04-30";

function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: OWNER_USER_ID,
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    // 财务总监具备公司级可见范围（modules/documents/routes.ts 的 hasCompanyWideAccess），
    // 免得用例的断言被单据的归口过滤挡住。
    roleCodes: ["role-finance-director", "role-accountant"],
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
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

function makeRequest(auth: AuthContext, url: string, body: unknown = {}): ApiRequest {
  return { method: "POST", url, auth, body } as ApiRequest;
}

/**
 * 按深链真实使用的过滤条件轮询审计记录。
 * writeAudit 即发即忘，轮询到出现为止（沿用本仓既有集成测试写法）。
 */
async function waitForAuditRow(
  pool: pg.Pool,
  filter: { resourceType: string; resourceId: string; action: string }
): Promise<{ entryHash: string | null; changes: Record<string, unknown> | null } | null> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await pool.query<{ entry_hash: string | null; changes: Record<string, unknown> | null }>(
      `select entry_hash, changes from audit_logs
        where company_id = $1 and resource_type = $2 and resource_id = $3 and action = $4
        order by created_at desc
        limit 1`,
      [COMPANY_ID, filter.resourceType, filter.resourceId, filter.action]
    );
    const row = result.rows[0];
    if (row) {
      return { entryHash: row.entry_hash, changes: row.changes };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

/** 断言「深链查得到」，并顺带钉死这条记录确实进了哈希链。 */
async function assertAudited(
  pool: pg.Pool,
  filter: { resourceType: string; resourceId: string; action: string },
  message: string
): Promise<Record<string, unknown> | null> {
  const row = await waitForAuditRow(pool, filter);
  assert.ok(row, `${message}（${filter.resourceType}/${filter.resourceId} 的 ${filter.action} 没有留痕）`);
  assert.ok(row.entryHash, "审计记录必须经 writeAudit 写入并算进哈希链");
  return row.changes;
}

/** 造一条可分析的销售事项，附一张 draft 凭证与一笔已入账收入分录。 */
async function seedSalesEvent(pool: pg.Pool, status: "submitted" | "analyzed"): Promise<void> {
  await pool.query(
    `insert into business_events
       (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source)
     values ($1, $2, 'sales', '留痕回归-销售事项', '', '财务部', $3, $4::date, 120000, 'CNY', $5, 'manual')`,
    [EVENT_ID, COMPANY_ID, OWNER_USER_ID, ENTRY_DATE, status]
  );
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary)
     values ($1, $2, $3, 'transfer', 'draft', '留痕回归凭证草稿')`,
    [`${VOUCHER_ID}-draft`, COMPANY_ID, EVENT_ID]
  );
  // 凭证保持 draft：analyze 闸门只拦已过账凭证，这里不该被它挡下。
  await pool.query(
    `insert into vouchers
       (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source)
     values ($1, $2, $3, $4, 'transfer', '留痕回归凭证', 'draft', 'analysis')`,
    [VOUCHER_ID, COMPANY_ID, EVENT_ID, `${VOUCHER_ID}-draft`]
  );
  // 主营业务收入 6001：让风险引擎认定「销售收入已入账」，从而产出风险发现。
  await pool.query(
    `insert into ledger_entries
       (id, company_id, voucher_id, business_event_id, entry_date, summary, account_code, account_name, debit, credit)
     values ($1, $2, $3, $4, $5::date, '留痕回归收入', '6001', '主营业务收入', 0, 120000)`,
    [`${VOUCHER_ID}-entry-1`, COMPANY_ID, VOUCHER_ID, EVENT_ID, ENTRY_DATE]
  );
}

test("单据：生成、状态变更、挂附件与归档都能按 document + 单据编号查到", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedSalesEvent(pool, "submitted");

    const { analyzeEvent } = await import("../events/routes.js");
    const { updateDocument, attachDocumentFile, archiveDocument } = await import("../documents/routes.js");
    const { closePool } = await import("../../db/client.js");
    const auth = createAuthContext();

    const analyzed = createResponseCapture();
    await analyzeEvent(makeRequest(auth, `/api/events/${EVENT_ID}/analyze`), analyzed.response, EVENT_ID);
    assert.equal(analyzed.readJson().statusCode, 200);

    const documents = await pool.query<{ id: string; status: string }>(
      "select id, status from generated_documents where company_id = $1 and business_event_id = $2 order by id",
      [COMPANY_ID, EVENT_ID]
    );
    assert.ok(documents.rows.length > 0, "夹具必须真的生成了单据，否则下面的断言是空转");

    for (const document of documents.rows) {
      await assertAudited(
        pool,
        { resourceType: "document", resourceId: document.id, action: "document.created" },
        "分析生成的每一份单据都要留痕"
      );
    }

    const target = documents.rows[0]!;

    // 状态变更：单独一个动作，审计员按动作就能筛出「谁改了单据状态」。
    const statusChanged = createResponseCapture();
    await updateDocument(
      makeRequest(auth, `/api/documents/${target.id}`, { status: "ready" }),
      statusChanged.response,
      target.id
    );
    assert.equal(statusChanged.readJson().statusCode, 200);
    const statusChanges = await assertAudited(
      pool,
      { resourceType: "document", resourceId: target.id, action: "document.status_changed" },
      "单据状态变更要留痕"
    );
    assert.equal(
      (statusChanges?.after as { status?: string } | undefined)?.status,
      "ready",
      "留痕要带上改成了什么状态"
    );

    // 只改标题不动状态时走 document.updated，不该冒充状态变更。
    const renamed = createResponseCapture();
    await updateDocument(
      makeRequest(auth, `/api/documents/${target.id}`, { title: "留痕回归-改名后的单据" }),
      renamed.response,
      target.id
    );
    assert.equal(renamed.readJson().statusCode, 200);
    await assertAudited(
      pool,
      { resourceType: "document", resourceId: target.id, action: "document.updated" },
      "非状态字段的修改也要留痕"
    );

    const attached = createResponseCapture();
    await attachDocumentFile(
      makeRequest(auth, `/api/documents/${target.id}/attach`, {
        attachmentId: "att-audit-trail-001",
        fileName: "留痕回归附件.pdf"
      }),
      attached.response,
      target.id
    );
    assert.equal(attached.readJson().statusCode, 200);
    await assertAudited(
      pool,
      { resourceType: "document", resourceId: target.id, action: "document.attachment_added" },
      "挂附件要留痕"
    );

    const archived = createResponseCapture();
    await archiveDocument(
      makeRequest(auth, `/api/documents/${target.id}/archive`),
      archived.response,
      target.id
    );
    assert.equal(archived.readJson().statusCode, 200);
    await assertAudited(
      pool,
      { resourceType: "document", resourceId: target.id, action: "document.archived" },
      "归档要留痕"
    );

    await closePool();
  } finally {
    await pool.end();
  }
});

test("税务事项：生成、状态变更与并入申报批次都能按 tax_item + 事项编号查到", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedSalesEvent(pool, "submitted");

    const { analyzeEvent } = await import("../events/routes.js");
    const { updateTaxItem, createTaxFilingBatch } = await import("../tax/routes.js");
    const { closePool } = await import("../../db/client.js");
    const auth = createAuthContext();

    const analyzed = createResponseCapture();
    await analyzeEvent(makeRequest(auth, `/api/events/${EVENT_ID}/analyze`), analyzed.response, EVENT_ID);
    assert.equal(analyzed.readJson().statusCode, 200);

    const taxItems = await pool.query<{ id: string; tax_type: string; filing_period: string }>(
      "select id, tax_type, filing_period from tax_items where company_id = $1 and business_event_id = $2 order by id",
      [COMPANY_ID, EVENT_ID]
    );
    assert.ok(taxItems.rows.length > 0, "夹具必须真的生成了税务事项");

    for (const item of taxItems.rows) {
      await assertAudited(
        pool,
        { resourceType: "tax_item", resourceId: item.id, action: "tax_item.created" },
        "分析生成的每一条税务事项都要留痕"
      );
    }

    const target = taxItems.rows[0]!;

    const statusChanged = createResponseCapture();
    await updateTaxItem(
      makeRequest(auth, `/api/tax/items/${target.id}`, { status: "ready" }),
      statusChanged.response,
      target.id
    );
    assert.equal(statusChanged.readJson().statusCode, 200);
    const statusChanges = await assertAudited(
      pool,
      { resourceType: "tax_item", resourceId: target.id, action: "tax_item.status_changed" },
      "税务事项状态变更要留痕"
    );
    assert.equal(
      (statusChanges?.after as { status?: string } | undefined)?.status,
      "ready",
      "留痕要带上改成了什么状态"
    );

    // 并入申报批次：批次一旦提交不可回退，事后必须能从事项本身查到批次号。
    const batched = createResponseCapture();
    await createTaxFilingBatch(
      makeRequest(auth, "/api/tax/filing-batches", {
        taxType: target.tax_type,
        filingPeriod: target.filing_period,
        itemIds: [target.id]
      }),
      batched.response
    );
    const batchResult = batched.readJson<{ id: string }>();
    assert.equal(batchResult.statusCode, 201);
    const batchChanges = await assertAudited(
      pool,
      { resourceType: "tax_item", resourceId: target.id, action: "tax_item.batched" },
      "并入申报批次要留痕"
    );
    assert.equal(
      (batchChanges?.data as { batchId?: string } | undefined)?.batchId,
      batchResult.body?.id,
      "留痕要带上进的是哪个批次，否则从事项追不回批次"
    );

    await closePool();
  } finally {
    await pool.end();
  }
});

test("风险发现：开启、关闭复核、重新打开与消解都能按 risk_finding + 发现编号查到", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedSalesEvent(pool, "analyzed");

    const { runEventRiskCheck, closeRiskFinding } = await import("../risk/routes.js");
    const { closePool } = await import("../../db/client.js");
    const auth = createAuthContext();

    // ── 开启：首次扫描命中的每条发现都要留痕 ──────────────────────────────
    const firstScan = createResponseCapture();
    await runEventRiskCheck(
      makeRequest(auth, `/api/events/${EVENT_ID}/risk-check`),
      firstScan.response,
      EVENT_ID
    );
    const scanned = firstScan.readJson<{ items: { id: string }[] }>();
    assert.equal(scanned.statusCode, 200);
    const findingIds = (scanned.body?.items ?? []).map((item) => item.id);
    assert.ok(findingIds.length > 0, "夹具必须真的触发了风险规则");

    for (const findingId of findingIds) {
      await assertAudited(
        pool,
        { resourceType: "risk_finding", resourceId: findingId, action: "risk.finding.opened" },
        "新命中的风险发现要留痕"
      );
    }

    // /risk 的「查看审计」深链就带这个 findingId，逐一验证它查得到东西。
    const target = findingIds[0]!;

    // ── 关闭复核 ────────────────────────────────────────────────────────
    const closed = createResponseCapture();
    await closeRiskFinding(
      makeRequest(auth, `/api/risk/findings/${target}/close`, { resolution: "已补开发票并入账" }),
      closed.response,
      target
    );
    assert.equal(closed.readJson().statusCode, 200);
    const closeChanges = await assertAudited(
      pool,
      { resourceType: "risk_finding", resourceId: target, action: "risk.finding.closed" },
      "关闭复核要留痕"
    );
    assert.equal(
      (closeChanges?.data as { resolution?: string } | undefined)?.resolution,
      "已补开发票并入账",
      "复核结论要进 changes，否则「凭什么关的」无从回答"
    );

    // ── 重新打开：重扫把已关闭的发现又命中了，关闭结论被推翻 ────────────────
    const rescan = createResponseCapture();
    await runEventRiskCheck(
      makeRequest(auth, `/api/events/${EVENT_ID}/risk-check`),
      rescan.response,
      EVENT_ID
    );
    assert.equal(rescan.readJson().statusCode, 200);
    const reopenChanges = await assertAudited(
      pool,
      { resourceType: "risk_finding", resourceId: target, action: "risk.finding.reopened" },
      "已关闭的发现被重扫命中要留痕"
    );
    assert.equal(
      (reopenChanges?.before as { status?: string } | undefined)?.status,
      "resolved",
      "留痕要说明它是从「已关闭」被翻回来的"
    );

    // ── 消解：把触发规则的事实撤掉，重扫后该发现物理消失 ────────────────────
    // 不留这一条，「风险为什么不见了」就没有任何答案。
    await pool.query("delete from ledger_entries where company_id = $1 and business_event_id = $2", [
      COMPANY_ID,
      EVENT_ID
    ]);
    const clearScan = createResponseCapture();
    await runEventRiskCheck(
      makeRequest(auth, `/api/events/${EVENT_ID}/risk-check`),
      clearScan.response,
      EVENT_ID
    );
    const cleared = clearScan.readJson<{ items: { id: string }[] }>();
    assert.equal(cleared.statusCode, 200);
    assert.ok(
      !(cleared.body?.items ?? []).some((item) => item.id === target),
      "夹具必须真的让这条发现不再命中"
    );
    await assertAudited(
      pool,
      { resourceType: "risk_finding", resourceId: target, action: "risk.finding.cleared" },
      "不再命中的风险发现要留痕"
    );

    // ── 一次扫描要写好几条留痕，哈希链不能因此断掉 ──────────────────────────
    // 这是本次改动最该守的不变量：新增的写入点每一处都必须经 writeAudit（它按公司
    // 串行排队算 prev_hash），谁图省事直接 insert audit_logs，链就在那一行断开。
    const { drainAuditQueues, verifyAuditChain } = await import("../../services/audit.js");
    await drainAuditQueues();
    const chain = createResponseCapture();
    await verifyAuditChain(
      { method: "GET", url: "/api/audit/verify-chain", auth } as ApiRequest,
      chain.response
    );
    const chainResult = chain.readJson<{ valid: boolean; total: number; brokenAt: number | null }>();
    assert.equal(chainResult.body?.valid, true, `哈希链必须完整，断点：${chainResult.body?.brokenAt}`);
    assert.ok((chainResult.body?.total ?? 0) > findingIds.length, "校验的链里必须真的包含本次新增的留痕");

    await closePool();
  } finally {
    await pool.end();
  }
});
