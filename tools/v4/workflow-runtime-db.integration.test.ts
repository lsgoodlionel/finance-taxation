import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../apps/api/src/types.js";
import { resetTestDatabase } from "./reset-test-db.ts";
import { seedAcceptanceData } from "./seed-acceptance-data.ts";

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
  let headers: Record<string, string> = {};

  const response = {
    writeHead(nextStatusCode: number, nextHeaders?: Record<string, string>) {
      statusCode = nextStatusCode;
      headers = { ...headers, ...(nextHeaders ?? {}) };
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
        headers,
        body: body ? (JSON.parse(body) as T) : null
      };
    }
  };
}

async function prepareDatabase() {
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("workflow db: export jobs persist, list, and retry through the real tables", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { createExportJob, listExportJobs, listExportArchiveEntries, updateExportJobStatus } =
      await import("../../apps/api/src/modules/exports/routes.js");
    const { closePool } = await import("../../apps/api/src/db/client.js");

    const createCapture = createResponseCapture();
    await createExportJob(
      {
        method: "POST",
        url: "/api/exports/jobs",
        auth: createAuthContext(),
        body: {
          kind: "report",
          label: "2026-05 利润表 PDF",
          fileName: "profit-statement-2026-05.pdf",
          resourceType: "report_snapshot",
          resourceId: "snapshot-2026-05",
          periodLabel: "2026-05"
        }
      } as ApiRequest,
      createCapture.response
    );
    const created = createCapture.readJson<{
      job: { id: string; status: string };
      archiveEntry: { jobId: string; archiveKey: string };
      reused: boolean;
    }>();

    assert.equal(created.statusCode, 201);
    assert.equal(created.body?.reused, false);
    assert.equal(created.body?.job.status, "created");
    assert.equal(created.body?.archiveEntry.jobId, created.body?.job.id);

    const listCapture = createResponseCapture();
    await listExportJobs(
      {
        method: "GET",
        url: "/api/exports/jobs?limit=10",
        auth: createAuthContext()
      } as ApiRequest,
      listCapture.response
    );
    const listed = listCapture.readJson<{ items: Array<{ id: string; status: string }>; total: number }>();
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.body?.total, 1);
    assert.equal(listed.body?.items[0]?.id, created.body?.job.id);
    assert.equal(listed.body?.items[0]?.status, "created");

    const failCapture = createResponseCapture();
    await updateExportJobStatus(
      {
        method: "POST",
        url: `/api/exports/jobs/${created.body?.job.id}/status`,
        auth: createAuthContext(),
        body: {
          status: "failed",
          errorMessage: "归档索引写入失败，等待重试"
        }
      } as ApiRequest,
      failCapture.response,
      created.body!.job.id
    );
    const failed = failCapture.readJson<{
      job: { status: string; lastError: string | null; nextRetryAt: string | null; retryCount: number };
    }>();
    assert.equal(failed.body?.job.status, "failed");
    assert.equal(failed.body?.job.lastError, "归档索引写入失败，等待重试");
    assert.equal(typeof failed.body?.job.nextRetryAt, "string");
    assert.equal(failed.body?.job.retryCount, 0);

    const retryCapture = createResponseCapture();
    await updateExportJobStatus(
      {
        method: "POST",
        url: `/api/exports/jobs/${created.body?.job.id}/status`,
        auth: createAuthContext(),
        body: { status: "opened" }
      } as ApiRequest,
      retryCapture.response,
      created.body!.job.id
    );
    const retried = retryCapture.readJson<{ job: { status: string } }>();
    assert.equal(retried.statusCode, 200);
    assert.equal(retried.body?.job.status, "opened");

    const archiveCapture = createResponseCapture();
    await listExportArchiveEntries(
      {
        method: "GET",
        url: "/api/exports/archive?limit=10",
        auth: createAuthContext()
      } as ApiRequest,
      archiveCapture.response
    );
    const archived = archiveCapture.readJson<{
      items: Array<{ jobId: string; archiveKey: string }>;
      total: number;
    }>();
    assert.equal(archived.statusCode, 200);
    assert.equal(archived.body?.total, 1);
    assert.equal(archived.body?.items[0]?.jobId, created.body?.job.id);
    assert.match(archived.body?.items[0]?.archiveKey ?? "", /^REPORT-2026-05-/);

    const dbJob = await pool.query<{
      status: string;
      retry_count: number;
      last_error: string | null;
      next_retry_at: string | null;
    }>(
      "select status, retry_count, last_error, next_retry_at from export_jobs where id = $1",
      [created.body?.job.id]
    );
    assert.equal(dbJob.rows[0]?.status, "opened");
    assert.equal(dbJob.rows[0]?.retry_count, 1);
    assert.equal(dbJob.rows[0]?.last_error, null);
    assert.equal(dbJob.rows[0]?.next_retry_at, null);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("workflow db: payroll transfer writes batch rows and compensates with a downstream business event", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into employees
        (id, company_id, department_id, name, id_card, position, hire_date, base_salary, status, notes, salary_account, salary_bank)
       values
        ('emp-v4-payroll-001', 'cmp-v4-tech', 'dept-v4-finance', '王会计', '310101199001010011', '会计', '2024-01-01', 12000, 'active', '', '6222020000000001', '招商银行'),
        ('emp-v4-payroll-002', 'cmp-v4-tech', 'dept-v4-finance', '李出纳', '310101199001010022', '出纳', '2024-01-01', 9000, 'active', '', '', '工商银行')`
    );
    await pool.query(
      `insert into payroll_records
        (id, company_id, period, employee_id, employee_name, gross_salary,
         social_security_employee, social_security_employer, housing_fund_employee, housing_fund_employer,
         iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name, notes)
       values
        ('pr-v4-001', 'cmp-v4-tech', '2026-05', 'emp-v4-payroll-001', '王会计', 12000, 1200, 2400, 1200, 1200, 320, 9280, 'confirmed', now(), 'usr-v4-accountant', 'v4_accountant', ''),
        ('pr-v4-002', 'cmp-v4-tech', '2026-05', 'emp-v4-payroll-002', '李出纳', 9000, 900, 1800, 900, 900, 120, 7080, 'confirmed', now(), 'usr-v4-accountant', 'v4_accountant', '')`
    );

    const {
      approveBatch,
      buildBatchFromPayroll,
      compensateDisbursedBatch,
      generateBatchFile,
      getBatchWithLines,
      markDisbursed
    } =
      await import("../../apps/api/src/modules/payroll/transfer.js");
    const { closePool } = await import("../../apps/api/src/db/client.js");

    const built = await buildBatchFromPayroll("cmp-v4-tech", "2026-05");
    assert.equal(built.employeeCount, 1);
    assert.equal(built.skipped, 1);
    assert.equal(built.totalAmount, 9280);

    const batchDetail = await getBatchWithLines("cmp-v4-tech", built.batchId);
    assert.ok(batchDetail);
    assert.equal(batchDetail?.batch.status, "draft");
    assert.equal(batchDetail?.lines.length, 2);
    assert.equal(batchDetail?.lines.filter((item) => item.status === "skipped").length, 1);

    await approveBatch("cmp-v4-tech", built.batchId, "usr-v4-accountant");
    const exported = await generateBatchFile("cmp-v4-tech", built.batchId, "generic");
    assert.equal(exported.lineCount, 1);
    assert.equal(exported.totalAmount, 9280);

    const disbursed = await markDisbursed("cmp-v4-tech", built.batchId, "usr-v4-cashier", "CMB-202605-001");

    const batchRows = await pool.query<{
      status: string;
      bank_transfer_ref: string | null;
      compensation_status: string;
      compensation_event_id: string | null;
    }>(
      "select status, bank_transfer_ref, compensation_status, compensation_event_id from payroll_transfer_batches where id = $1",
      [built.batchId]
    );
    assert.equal(batchRows.rows[0]?.status, "disbursed");
    assert.equal(batchRows.rows[0]?.bank_transfer_ref, "CMB-202605-001");
    assert.equal(batchRows.rows[0]?.compensation_status, "completed");
    assert.equal(batchRows.rows[0]?.compensation_event_id, disbursed.eventId);

    const eventRows = await pool.query<{ type: string; title: string; description: string }>(
      `select type, title, description
       from business_events
       where company_id = 'cmp-v4-tech' and type = 'payroll_disbursed'
       order by created_at desc
       limit 1`
    );
    assert.equal(eventRows.rows[0]?.type, "payroll_disbursed");
    assert.match(eventRows.rows[0]?.title ?? "", /2026-05 工资代发完成/);
    assert.match(eventRows.rows[0]?.description ?? "", /CMB-202605-001/);

    await pool.query(
      `insert into payroll_transfer_batches
        (id, company_id, payroll_period, total_amount, employee_count, status, bank_transfer_ref,
         retry_count, last_error, compensation_status, created_at, updated_at)
       values
        ('ptb-v4-comp-001', 'cmp-v4-tech', '2026-06', 1000, 1, 'disbursed', 'ABC-202606-001',
         0, '下游事项缺失', 'failed', now(), now())`
    );

    const compensated = await compensateDisbursedBatch("cmp-v4-tech", "ptb-v4-comp-001", "usr-v4-accountant");
    assert.equal(compensated.reused, false);

    const compensatedBatch = await pool.query<{
      compensation_status: string;
      compensation_event_id: string | null;
      retry_count: number;
      last_error: string | null;
    }>(
      `select compensation_status, compensation_event_id, retry_count, last_error
       from payroll_transfer_batches
       where id = 'ptb-v4-comp-001'`
    );
    assert.equal(compensatedBatch.rows[0]?.compensation_status, "completed");
    assert.equal(compensatedBatch.rows[0]?.compensation_event_id, compensated.eventId);
    assert.equal(compensatedBatch.rows[0]?.retry_count, 1);
    assert.equal(compensatedBatch.rows[0]?.last_error, null);

    await closePool();
  } finally {
    await pool.end();
  }
});

test("workflow db: runtime routes return stable task, tax, vouchers, payroll, and payroll-transfer summaries", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into business_events
        (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, created_at, updated_at)
       values
        ('evt-v4-runtime-task', 'cmp-v4-tech', 'expense', '运行态测试事项', '', '财务部', 'usr-v4-accountant', '2026-05-20', 100, 'CNY', 'needs_review', 'manual', now(), now())`
    );
    await pool.query(
      `insert into tasks
        (id, company_id, business_event_id, parent_task_id, title, description, status, priority, owner_id, due_at, assignee_department, source, created_at, updated_at)
       values
        ('task-v4-runtime-blocked', 'cmp-v4-tech', 'evt-v4-runtime-task', null, '补资料', '', 'blocked', 'high', 'usr-v4-accountant', null, '财务部', 'workflow', now(), now()),
        ('task-v4-runtime-review', 'cmp-v4-tech', 'evt-v4-runtime-task', null, '复核推进', '', 'in_review', 'medium', 'usr-v4-accountant', null, '财务部', 'workflow', now(), now())`
    );
    await pool.query(
      `insert into employees
        (id, company_id, department_id, name, id_card, position, hire_date, base_salary, status, notes, salary_account, salary_bank)
       values
        ('emp-v4-runtime-001', 'cmp-v4-tech', 'dept-v4-finance', '王会计', '310101199001010033', '会计', '2024-01-01', 12000, 'active', '', '6222020000000002', '招商银行')`
    );
    await pool.query(
      `insert into payroll_records
        (id, company_id, period, employee_id, employee_name, gross_salary,
         social_security_employee, social_security_employer, housing_fund_employee, housing_fund_employer,
         iit_withheld, net_pay, status, confirmed_at, confirmed_by_user_id, confirmed_by_name, notes)
       values
        ('pr-v4-runtime-001', 'cmp-v4-tech', '2026-06', 'emp-v4-runtime-001', '王会计', 12000, 1200, 2400, 1200, 1200, 320, 9280, 'confirmed', now(), 'usr-v4-accountant', 'v4_accountant', '')`
    );
    await pool.query(
      `insert into event_voucher_drafts
        (id, company_id, business_event_id, voucher_type, status, summary)
       values
        ('map-v4-runtime-001', 'cmp-v4-tech', 'evt-v4-runtime-task', 'expense', 'draft', '运行态测试凭证草稿')`
    );
    await pool.query(
      `insert into vouchers
        (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, approved_at, posted_at, created_at, updated_at)
       values
        ('vou-v4-runtime-001', 'cmp-v4-tech', 'evt-v4-runtime-task', 'map-v4-runtime-001', 'expense', '运行态测试凭证', 'draft', 'analysis', null, null, now(), now())`
    );
    await pool.query(
      `insert into voucher_draft_lines
        (id, draft_id, summary, account_code, account_name, debit, credit, sort_order)
       values
        ('draft-line-v4-runtime-001', 'map-v4-runtime-001', '管理费用', '6602', '管理费用', 100.00, 0.00, 1),
        ('draft-line-v4-runtime-002', 'map-v4-runtime-001', '其他应付款', '2241', '其他应付款', 0.00, 100.00, 2)`
    );
    await pool.query(
      `insert into voucher_lines
        (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values
        ('vou-line-v4-runtime-001', 'vou-v4-runtime-001', '管理费用', '6602', '管理费用', 100.00, 0.00, 1),
        ('vou-line-v4-runtime-002', 'vou-v4-runtime-001', '其他应付款', '2241', '其他应付款', 0.00, 100.00, 2)`
    );

    const { createEvent } = await import("../../apps/api/src/modules/events/routes.js");
    const { syncPayrollReviewLedgers } = await import("../../apps/api/src/modules/payroll/routes.js");
    const { approveBatch, buildBatchFromPayroll, generateBatchFile } = await import("../../apps/api/src/modules/payroll/transfer.js");
    const { approveVoucher } = await import("../../apps/api/src/modules/vouchers/routes.js");
    const {
      getPayrollRuntimeSummaryRoute,
      getPayrollTransferRuntimeSummaryRoute,
      getTaskRuntimeSummaryRoute,
      getTaxRuntimeSummaryRoute,
      getVoucherRuntimeSummaryRoute
    } = await import("../../apps/api/src/modules/runtime/routes.js");
    const { closePool } = await import("../../apps/api/src/db/client.js");

    const eventCapture = createResponseCapture();
    await createEvent(
      {
        method: "POST",
        url: "/api/events",
        auth: createAuthContext(),
        body: {
          type: "payroll",
          title: "2026-06 工资计提与薪酬发放事项",
          description: "工资期间：2026-06",
          department: "人事行政部",
          occurredOn: "2026-06-01",
          amount: "12000.00",
          currency: "CNY",
          source: "manual"
        }
      } as ApiRequest,
      eventCapture.response
    );
    const eventPayload = eventCapture.readJson<{ id: string }>();
    const payrollEventId = eventPayload.body?.id ?? "";
    assert.ok(payrollEventId);

    await syncPayrollReviewLedgers(
      {
        method: "POST",
        url: "/api/payroll/review-ledgers",
        auth: createAuthContext(),
        body: {
          period: "2026-06",
          businessEventId: payrollEventId
        }
      } as ApiRequest,
      createResponseCapture().response
    );

    const built = await buildBatchFromPayroll("cmp-v4-tech", "2026-06");
    await approveBatch("cmp-v4-tech", built.batchId, "usr-v4-manager");
    await generateBatchFile("cmp-v4-tech", built.batchId, "generic");
    await approveVoucher(
      {
        method: "POST",
        url: "/api/vouchers/vou-v4-runtime-001/approve",
        auth: createAuthContext()
      } as ApiRequest,
      createResponseCapture().response,
      "vou-v4-runtime-001"
    );

    const taskCapture = createResponseCapture();
    await getTaskRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tasks?businessEventId=evt-v4-runtime-task",
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager",
          departmentId: "dept-v4-sales",
          departmentName: "销售部"
        })
      } as ApiRequest,
      taskCapture.response
    );
    const taskPayload = taskCapture.readJson<{
      summary: {
        executionState: string;
        authorizationState: string;
        stats: Array<{ label: string; value: string }>;
        issue?: { title: string; tone: string };
        actions?: Array<{ key: string; params?: Record<string, string> }>;
      };
    }>();
    assert.equal(taskPayload.statusCode, 200);
    assert.equal(taskPayload.body?.summary.executionState, "failed");
    assert.equal(taskPayload.body?.summary.authorizationState, "authorized");
    assert.equal(taskPayload.body?.summary.issue?.tone, "error");
    assert.equal(taskPayload.body?.summary.actions?.[0]?.key, "retry-blocked-task");
    assert.equal(taskPayload.body?.summary.actions?.[0]?.params?.taskId, "task-v4-runtime-blocked");

    const taxCapture = createResponseCapture();
    await getTaxRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tax",
        auth: createAuthContext()
      } as ApiRequest,
      taxCapture.response
    );
    const taxPayload = taxCapture.readJson<{
      summary: {
        executionState: string;
        authorizationState: string;
        authorizationLabel: string;
        issue?: { tone: string };
      };
    }>();
    assert.equal(taxPayload.statusCode, 200);
    assert.equal(taxPayload.body?.summary.executionState, "waiting");
    assert.equal(taxPayload.body?.summary.authorizationState, "insufficient");
    assert.equal(taxPayload.body?.summary.authorizationLabel, "口径未建立");
    assert.equal(taxPayload.body?.summary.issue?.tone, "warning");

    const voucherCapture = createResponseCapture();
    await getVoucherRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/vouchers?businessEventId=evt-v4-runtime-task&voucherId=vou-v4-runtime-001",
        auth: createAuthContext()
      } as ApiRequest,
      voucherCapture.response
    );
    const voucherPayload = voucherCapture.readJson<{
      summary: {
        executionState: string;
        authorizationState: string;
        authorizationLabel: string;
      };
    }>();
    assert.equal(voucherPayload.statusCode, 200);
    assert.equal(voucherPayload.body?.summary.executionState, "running");
    assert.equal(voucherPayload.body?.summary.authorizationState, "authorized");
    assert.equal(voucherPayload.body?.summary.authorizationLabel, "你可审核过账");

    const payrollCapture = createResponseCapture();
    await getPayrollRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/payroll?period=2026-06",
        auth: createAuthContext()
      } as ApiRequest,
      payrollCapture.response
    );
    const payrollPayload = payrollCapture.readJson<{
      summary: { executionState: string; authorizationState: string; stats: Array<{ label: string; value: string }> };
    }>();
    assert.equal(payrollPayload.statusCode, 200);
    assert.equal(payrollPayload.body?.summary.executionState, "running");
    assert.equal(payrollPayload.body?.summary.authorizationState, "authorized");
    assert.equal(
      payrollPayload.body?.summary.stats.find((item) => item.label === "已确认工资")?.value,
      "1"
    );

    const transferCapture = createResponseCapture();
    await getPayrollTransferRuntimeSummaryRoute(
      {
        method: "GET",
        url: `/api/runtime/payroll-transfer?batchId=${built.batchId}`,
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager"
        })
      } as ApiRequest,
      transferCapture.response
    );
    const transferPayload = transferCapture.readJson<{
      summary: { executionState: string; authorizationState: string; authorizationLabel: string };
    }>();
    assert.equal(transferPayload.statusCode, 200);
    assert.equal(transferPayload.body?.summary.executionState, "running");
    assert.equal(transferPayload.body?.summary.authorizationState, "authorized");
    assert.equal(transferPayload.body?.summary.authorizationLabel, "你可推进代发");

    await closePool();
  } finally {
    await pool.end();
  }
});

test("workflow db: runtime repair actions reopen blocked tasks, re-review tax batches, validate vouchers, and compensate payroll transfer gaps", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `insert into business_events
        (id, company_id, type, title, description, department, owner_id, occurred_on, amount, currency, status, source, created_at, updated_at)
       values
        ('evt-v4-repair-001', 'cmp-v4-tech', 'expense', '修复动作测试事项', '', '财务部', 'usr-v4-accountant', '2026-05-21', 100, 'CNY', 'needs_review', 'manual', now(), now())`
    );
    await pool.query(
      `insert into tasks
        (id, company_id, business_event_id, parent_task_id, title, description, status, priority, owner_id, due_at, assignee_department, source, created_at, updated_at)
       values
        ('task-v4-repair-001', 'cmp-v4-tech', 'evt-v4-repair-001', null, '补回票据', '缺少报销附件', 'blocked', 'high', 'usr-v4-accountant', null, '财务部', 'workflow', now(), now())`
    );
    await pool.query(
      `insert into taxpayer_profiles
        (id, company_id, taxpayer_type, effective_from, status, notes, created_at, updated_at)
       values
        ('tp-v4-repair-001', 'cmp-v4-tech', 'general_vat', '2026-01-01', 'active', '', now(), now())`
    );
    await pool.query(
      `insert into event_tax_mappings
        (id, company_id, business_event_id, tax_type, treatment, status, basis, filing_period)
       values
        ('tax-map-v4-repair-001', 'cmp-v4-tech', 'evt-v4-repair-001', 'vat_input', '补充进项发票后重新复核', 'review_required', '进项抵扣资料不完整', '2026-05')`
    );
    await pool.query(
      `insert into tax_items
        (id, company_id, business_event_id, mapping_id, tax_type, treatment, basis, filing_period, status, source, created_at, updated_at)
       values
        ('tax-item-v4-repair-001', 'cmp-v4-tech', 'evt-v4-repair-001', 'tax-map-v4-repair-001', '增值税', '补充进项发票后重新复核', '进项抵扣资料不完整', '2026-05', 'review_required', 'analysis', now(), now())`
    );
    await pool.query(
      `insert into tax_filing_batches
        (id, company_id, tax_type, filing_period, status, created_at, updated_at)
       values
        ('tax-batch-v4-repair-001', 'cmp-v4-tech', '增值税', '2026-05', 'review_required', now(), now())`
    );
    await pool.query(
      `insert into tax_filing_batch_items (batch_id, tax_item_id)
       values ('tax-batch-v4-repair-001', 'tax-item-v4-repair-001')`
    );
    await pool.query(
      `insert into event_voucher_drafts
        (id, company_id, business_event_id, voucher_type, status, summary)
       values
        ('map-v4-repair-001', 'cmp-v4-tech', 'evt-v4-repair-001', 'expense', 'draft', '修复动作测试凭证草稿')`
    );
    await pool.query(
      `insert into vouchers
        (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, approved_at, posted_at, created_at, updated_at)
       values
        ('vou-v4-repair-001', 'cmp-v4-tech', 'evt-v4-repair-001', 'map-v4-repair-001', 'expense', '修复动作测试凭证', 'draft', 'analysis', null, null, now(), now())`
    );
    await pool.query(
      `insert into voucher_lines
        (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values
        ('vou-line-v4-repair-001', 'vou-v4-repair-001', '管理费用', '6602', '管理费用', 100.00, 0.00, 1)`
    );
    await pool.query(
      `insert into payroll_transfer_batches
        (id, company_id, payroll_period, total_amount, employee_count, status, bank_transfer_ref,
         retry_count, last_error, next_retry_at, compensation_status, compensation_event_id, compensated_at, created_at, updated_at)
       values
        ('ptb-v4-repair-001', 'cmp-v4-tech', '2026-05', 9280.00, 1, 'disbursed', 'BANK-202605-REPAIR',
         2, '经营事项补偿失败，等待重新补偿。', now() + interval '15 minutes', 'failed', null, null, now(), now())`
    );

    const { updateTask } = await import("../../apps/api/src/modules/tasks/routes.js");
    const { reviewTaxFilingBatch } = await import("../../apps/api/src/modules/tax/routes.js");
    const { compensateBatchRoute } = await import("../../apps/api/src/modules/payroll/transfer.routes.js");
    const { validateVoucher } = await import("../../apps/api/src/modules/vouchers/routes.js");
    const {
      getPayrollTransferRuntimeSummaryRoute,
      getTaskRuntimeSummaryRoute,
      getTaxRuntimeSummaryRoute,
      getVoucherRuntimeSummaryRoute
    } = await import("../../apps/api/src/modules/runtime/routes.js");
    const { closePool } = await import("../../apps/api/src/db/client.js");

    const blockedTaskCapture = createResponseCapture();
    await getTaskRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tasks?businessEventId=evt-v4-repair-001",
        auth: createAuthContext()
      } as ApiRequest,
      blockedTaskCapture.response
    );
    const blockedTaskSummary = blockedTaskCapture.readJson<{
      summary: { actions?: Array<{ key: string; params?: Record<string, string> }> };
    }>();
    assert.equal(blockedTaskSummary.body?.summary.actions?.[0]?.key, "retry-blocked-task");

    const reopenTaskCapture = createResponseCapture();
    await updateTask(
      {
        method: "PUT",
        url: "/api/tasks/task-v4-repair-001",
        auth: createAuthContext(),
        body: { status: "not_started" }
      } as ApiRequest,
      reopenTaskCapture.response,
      "task-v4-repair-001"
    );
    const reopenedTask = reopenTaskCapture.readJson<{ status: string }>();
    assert.equal(reopenedTask.statusCode, 200);
    assert.equal(reopenedTask.body?.status, "not_started");
    const reopenedTaskRow = await pool.query<{ status: string }>(
      "select status from tasks where id = 'task-v4-repair-001'"
    );
    assert.equal(reopenedTaskRow.rows[0]?.status, "not_started");
    const reopenedTaskSummaryCapture = createResponseCapture();
    await getTaskRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tasks?businessEventId=evt-v4-repair-001",
        auth: createAuthContext()
      } as ApiRequest,
      reopenedTaskSummaryCapture.response
    );
    const reopenedTaskSummary = reopenedTaskSummaryCapture.readJson<{
      summary: { executionState: string; issue?: { tone: string }; actions?: Array<{ key: string }> };
    }>();
    assert.equal(reopenedTaskSummary.statusCode, 200);
    assert.equal(reopenedTaskSummary.body?.summary.executionState, "waiting");
    assert.equal(reopenedTaskSummary.body?.summary.issue, undefined);
    assert.equal(reopenedTaskSummary.body?.summary.actions?.length ?? 0, 0);

    const taxSummaryCapture = createResponseCapture();
    await getTaxRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tax?batchId=tax-batch-v4-repair-001&businessEventId=evt-v4-repair-001",
        auth: createAuthContext({ roleCodes: ["role-tax-specialist"] })
      } as ApiRequest,
      taxSummaryCapture.response
    );
    const taxSummary = taxSummaryCapture.readJson<{
      summary: { issue?: { tone: string }; actions?: Array<{ key: string; params?: Record<string, string> }> };
    }>();
    assert.equal(taxSummary.body?.summary.issue?.tone, "error");
    assert.equal(taxSummary.body?.summary.actions?.[0]?.key, "retry-tax-review");

    const reviewCapture = createResponseCapture();
    await reviewTaxFilingBatch(
      {
        method: "POST",
        url: "/api/tax/batches/tax-batch-v4-repair-001/review",
        auth: createAuthContext({
          roleCodes: ["role-tax-specialist"],
          userId: "usr-v4-tax",
          username: "v4_tax"
        }),
        body: { reviewResult: "approved", reviewNotes: "runtime quick retry" }
      } as ApiRequest,
      reviewCapture.response,
      "tax-batch-v4-repair-001"
    );
    const reviewedBatch = reviewCapture.readJson<{ status: string; reviews: Array<{ reviewNotes: string }> }>();
    assert.equal(reviewedBatch.statusCode, 200);
    assert.equal(reviewedBatch.body?.status, "ready");
    assert.equal(reviewedBatch.body?.reviews[0]?.reviewNotes, "runtime quick retry");
    const reviewedBatchRow = await pool.query<{ status: string }>(
      "select status from tax_filing_batches where id = 'tax-batch-v4-repair-001'"
    );
    assert.equal(reviewedBatchRow.rows[0]?.status, "ready");
    const reviewedBatchSummaryCapture = createResponseCapture();
    await getTaxRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/tax?batchId=tax-batch-v4-repair-001&businessEventId=evt-v4-repair-001",
        auth: createAuthContext({ roleCodes: ["role-tax-specialist"] })
      } as ApiRequest,
      reviewedBatchSummaryCapture.response
    );
    const reviewedBatchSummary = reviewedBatchSummaryCapture.readJson<{
      summary: {
        executionState: string;
        authorizationState: string;
        issue?: { tone: string };
        actions?: Array<{ key: string }>;
      };
    }>();
    assert.equal(reviewedBatchSummary.statusCode, 200);
    assert.equal(reviewedBatchSummary.body?.summary.executionState, "running");
    assert.equal(reviewedBatchSummary.body?.summary.authorizationState, "authorized");
    assert.equal(reviewedBatchSummary.body?.summary.issue, undefined);
    assert.equal(reviewedBatchSummary.body?.summary.actions?.length ?? 0, 0);

    const voucherSummaryCapture = createResponseCapture();
    await getVoucherRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/vouchers?businessEventId=evt-v4-repair-001&voucherId=vou-v4-repair-001",
        auth: createAuthContext()
      } as ApiRequest,
      voucherSummaryCapture.response
    );
    const voucherSummary = voucherSummaryCapture.readJson<{
      summary: { issue?: { tone: string; title: string }; actions?: Array<{ key: string }> };
    }>();
    assert.equal(voucherSummary.body?.summary.issue?.tone, "error");
    assert.equal(voucherSummary.body?.summary.actions?.[0]?.key, "retry-voucher-validate");

    const validateCapture = createResponseCapture();
    await validateVoucher(
      {
        method: "POST",
        url: "/api/vouchers/vou-v4-repair-001/validate",
        auth: createAuthContext()
      } as ApiRequest,
      validateCapture.response,
      "vou-v4-repair-001"
    );
    const validationPayload = validateCapture.readJson<{
      valid: boolean;
      issues: string[];
      totals: { debit: string; credit: string };
    }>();
    assert.equal(validationPayload.statusCode, 200);
    assert.equal(validationPayload.body?.valid, false);
    assert.match(validationPayload.body?.issues[0] ?? "", /借贷不平/);
    assert.equal(validationPayload.body?.totals.credit, "0.00");
    const invalidVoucherRow = await pool.query<{ status: string }>(
      "select status from vouchers where id = 'vou-v4-repair-001'"
    );
    assert.equal(invalidVoucherRow.rows[0]?.status, "draft");
    await pool.query(
      `insert into voucher_lines
        (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
       values
        ('vou-line-v4-repair-002', 'vou-v4-repair-001', '其他应付款', '2241', '其他应付款', 0.00, 100.00, 2)`
    );
    const revalidateCapture = createResponseCapture();
    await validateVoucher(
      {
        method: "POST",
        url: "/api/vouchers/vou-v4-repair-001/validate",
        auth: createAuthContext()
      } as ApiRequest,
      revalidateCapture.response,
      "vou-v4-repair-001"
    );
    const revalidatedVoucher = revalidateCapture.readJson<{
      valid: boolean;
      issues: string[];
      totals: { debit: string; credit: string };
    }>();
    assert.equal(revalidatedVoucher.statusCode, 200);
    assert.equal(revalidatedVoucher.body?.valid, true);
    assert.deepEqual(revalidatedVoucher.body?.issues, []);
    assert.equal(revalidatedVoucher.body?.totals.debit, "100.00");
    assert.equal(revalidatedVoucher.body?.totals.credit, "100.00");
    const repairedVoucherSummaryCapture = createResponseCapture();
    await getVoucherRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/vouchers?businessEventId=evt-v4-repair-001&voucherId=vou-v4-repair-001",
        auth: createAuthContext()
      } as ApiRequest,
      repairedVoucherSummaryCapture.response
    );
    const repairedVoucherSummary = repairedVoucherSummaryCapture.readJson<{
      summary: { issue?: { tone: string }; actions?: Array<{ key: string }> };
    }>();
    assert.equal(repairedVoucherSummary.statusCode, 200);
    assert.equal(repairedVoucherSummary.body?.summary.issue, undefined);
    assert.equal(repairedVoucherSummary.body?.summary.actions?.length ?? 0, 0);

    const transferSummaryCapture = createResponseCapture();
    await getPayrollTransferRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/payroll-transfer?batchId=ptb-v4-repair-001",
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager"
        })
      } as ApiRequest,
      transferSummaryCapture.response
    );
    const transferSummary = transferSummaryCapture.readJson<{
      summary: {
        executionState: string;
        issue?: { tone: string };
        actions?: Array<{ key: string; params?: Record<string, string> }>;
      };
    }>();
    assert.equal(transferSummary.statusCode, 200);
    assert.equal(transferSummary.body?.summary.executionState, "failed");
    assert.equal(transferSummary.body?.summary.issue?.tone, "error");
    assert.equal(transferSummary.body?.summary.actions?.[0]?.key, "compensate-transfer-batch");
    assert.equal(transferSummary.body?.summary.actions?.[0]?.params?.batchId, "ptb-v4-repair-001");

    const compensateCapture = createResponseCapture();
    await compensateBatchRoute(
      {
        method: "POST",
        url: "/api/payroll/transfer/batches/ptb-v4-repair-001/compensate",
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager"
        })
      } as ApiRequest,
      compensateCapture.response,
      "ptb-v4-repair-001"
    );
    const compensatePayload = compensateCapture.readJson<{ eventId: string; reused: boolean }>();
    assert.equal(compensateCapture.readJson<{ eventId: string; reused: boolean }>().statusCode, 200);
    assert.equal(compensatePayload.body?.reused, false);
    assert.ok(compensatePayload.body?.eventId);

    const repairedBatchRow = await pool.query<{
      compensation_status: string;
      compensation_event_id: string | null;
      retry_count: number;
      last_error: string | null;
    }>(
      `select compensation_status, compensation_event_id, retry_count, last_error
       from payroll_transfer_batches
       where id = 'ptb-v4-repair-001'`
    );
    assert.equal(repairedBatchRow.rows[0]?.compensation_status, "completed");
    assert.equal(repairedBatchRow.rows[0]?.compensation_event_id, compensatePayload.body?.eventId);
    assert.equal(repairedBatchRow.rows[0]?.retry_count, 3);
    assert.equal(repairedBatchRow.rows[0]?.last_error, null);
    const repairedTransferSummaryCapture = createResponseCapture();
    await getPayrollTransferRuntimeSummaryRoute(
      {
        method: "GET",
        url: "/api/runtime/payroll-transfer?batchId=ptb-v4-repair-001",
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager"
        })
      } as ApiRequest,
      repairedTransferSummaryCapture.response
    );
    const repairedTransferSummary = repairedTransferSummaryCapture.readJson<{
      summary: {
        executionState: string;
        issue?: { tone: string };
        actions?: Array<{ key: string }>;
      };
    }>();
    assert.equal(repairedTransferSummary.statusCode, 200);
    assert.equal(repairedTransferSummary.body?.summary.executionState, "succeeded");
    assert.equal(repairedTransferSummary.body?.summary.issue, undefined);
    assert.equal(repairedTransferSummary.body?.summary.actions?.length ?? 0, 0);

    const compensateAgainCapture = createResponseCapture();
    await compensateBatchRoute(
      {
        method: "POST",
        url: "/api/payroll/transfer/batches/ptb-v4-repair-001/compensate",
        auth: createAuthContext({
          roleCodes: ["role-finance-director"],
          userId: "usr-v4-manager",
          username: "v4_manager"
        })
      } as ApiRequest,
      compensateAgainCapture.response,
      "ptb-v4-repair-001"
    );
    const compensateAgainPayload = compensateAgainCapture.readJson<{ eventId: string; reused: boolean }>();
    assert.equal(compensateAgainPayload.statusCode, 200);
    assert.equal(compensateAgainPayload.body?.reused, true);
    assert.equal(compensateAgainPayload.body?.eventId, compensatePayload.body?.eventId);
    const reusedBatchRow = await pool.query<{
      compensation_event_id: string | null;
      retry_count: number;
    }>(
      `select compensation_event_id, retry_count
       from payroll_transfer_batches
       where id = 'ptb-v4-repair-001'`
    );
    assert.equal(reusedBatchRow.rows[0]?.compensation_event_id, compensatePayload.body?.eventId);
    assert.equal(reusedBatchRow.rows[0]?.retry_count, 3);
    const compensatedEvents = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from business_events
       where company_id = 'cmp-v4-tech'
         and id = $1`,
      [compensatePayload.body?.eventId]
    );
    assert.equal(compensatedEvents.rows[0]?.count, "1");

    await closePool();
  } finally {
    await pool.end();
  }
});
