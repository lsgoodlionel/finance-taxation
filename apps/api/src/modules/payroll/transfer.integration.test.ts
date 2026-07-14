import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

async function prepareDatabase() {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function seedPayrollRecords(pool: pg.Pool) {
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
}

test("markDisbursed is idempotent and does not create duplicate business events on repeated submission", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await seedPayrollRecords(pool);
    const {
      approveBatch,
      buildBatchFromPayroll,
      generateBatchFile,
      markDisbursed
    } = await import("./transfer.js");
    const { closePool } = await import("../../db/client.js");

    const built = await buildBatchFromPayroll("cmp-v4-tech", "2026-05");
    await approveBatch("cmp-v4-tech", built.batchId, "usr-v4-accountant");
    await generateBatchFile("cmp-v4-tech", built.batchId, "generic");

    const first = await markDisbursed("cmp-v4-tech", built.batchId, "usr-v4-cashier", "CMB-202605-001");
    const second = await markDisbursed("cmp-v4-tech", built.batchId, "usr-v4-cashier", "CMB-202605-001");

    assert.equal(second.eventId, first.eventId);
    assert.equal(second.reused, true);

    const eventRows = await pool.query<{ id: string }>(
      `select id
       from business_events
       where company_id = $1 and type = 'payroll_disbursed'
       order by created_at asc`,
      ["cmp-v4-tech"]
    );
    assert.equal(eventRows.rows.length, 1);
    assert.equal(eventRows.rows[0]?.id, first.eventId);

    // writeAudit is fire-and-forget through a per-company serial hash-chain queue;
    // drain it before asserting the audit row is durably persisted.
    const { drainAuditQueues } = await import("../../services/audit.js");
    await drainAuditQueues();
    const auditRows = await pool.query<{ action: string }>(
      `select action
       from audit_logs
       where company_id = $1
         and resource_type = 'payroll_transfer_batch'
         and resource_id = $2
       order by created_at desc`,
      ["cmp-v4-tech", built.batchId]
    );
    assert.equal(
      auditRows.rows.filter((row) => row.action === "payroll.transfer.disbursed").length,
      1
    );

    await closePool();
  } finally {
    await pool.end();
  }
});

test("compensateDisbursedBatch clears retry metadata, links the new event once, and reuses it on repeated compensation", async () => {
  await prepareDatabase();

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const { compensateDisbursedBatch } = await import("./transfer.js");
    const { closePool } = await import("../../db/client.js");

    await pool.query(
      `insert into payroll_transfer_batches
        (id, company_id, payroll_period, total_amount, employee_count, status, bank_transfer_ref,
         retry_count, last_error, last_attempt_at, next_retry_at, compensation_status, compensation_event_id, notes)
       values
        ($1, $2, '2026-05', 9280, 1, 'disbursed', 'CMB-202605-FAILED',
         1, '经营事项补偿失败，等待重新补偿。', now() - interval '30 minutes', now() + interval '15 minutes', 'failed', null, '')`,
      ["ptb-v4-compensate-001", "cmp-v4-tech"]
    );

    const first = await compensateDisbursedBatch(
      "cmp-v4-tech",
      "ptb-v4-compensate-001",
      "usr-v4-accountant"
    );
    const second = await compensateDisbursedBatch(
      "cmp-v4-tech",
      "ptb-v4-compensate-001",
      "usr-v4-accountant"
    );

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.eventId, first.eventId);

    const batchRows = await pool.query<{
      retry_count: number;
      last_error: string | null;
      next_retry_at: string | null;
      compensation_status: string;
      compensation_event_id: string | null;
    }>(
      `select retry_count, last_error, next_retry_at, compensation_status, compensation_event_id
       from payroll_transfer_batches
       where id = $1`,
      ["ptb-v4-compensate-001"]
    );
    assert.equal(batchRows.rows[0]?.retry_count, 2);
    assert.equal(batchRows.rows[0]?.last_error, null);
    assert.equal(batchRows.rows[0]?.next_retry_at, null);
    assert.equal(batchRows.rows[0]?.compensation_status, "completed");
    assert.equal(batchRows.rows[0]?.compensation_event_id, first.eventId);

    const eventRows = await pool.query<{ id: string }>(
      `select id
       from business_events
       where company_id = $1 and type = 'payroll_disbursed'
       order by created_at asc`,
      ["cmp-v4-tech"]
    );
    assert.equal(eventRows.rows.length, 1);
    assert.equal(eventRows.rows[0]?.id, first.eventId);

    // writeAudit is fire-and-forget through a per-company serial hash-chain queue;
    // drain it before asserting the audit row is durably persisted.
    const { drainAuditQueues } = await import("../../services/audit.js");
    await drainAuditQueues();
    const auditRows = await pool.query<{ action: string }>(
      `select action
       from audit_logs
       where company_id = $1
         and resource_type = 'payroll_transfer_batch'
         and resource_id = $2
       order by created_at desc`,
      ["cmp-v4-tech", "ptb-v4-compensate-001"]
    );
    assert.equal(
      auditRows.rows.filter((row) => row.action === "payroll.transfer.compensated").length,
      1
    );

    await closePool();
  } finally {
    await pool.end();
  }
});
