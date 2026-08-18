/**
 * 质保金到期扫描的路径级断言（V13 残留 11）。
 *
 * 三件事：到期的才提醒、已付清的不提醒、重复扫描不堆任务。
 *
 * 第三条最要紧——扫描是定时跑的，不幂等的话一个月后任务中心里会有
 * 三十条一模一样的提醒，而真正该做的事被淹没在里面。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

test("质保金到期扫描", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { JOB_HANDLERS } = await import("./handlers.js");
  const scan = JOB_HANDLERS.retention_release_scan!;

  const userRow = await pool.query<{ id: string }>(
    `select id from users where company_id = $1 order by id limit 1`,
    [COMPANY_ID]
  );
  const userId = userRow.rows[0]!.id;

  await pool.query(
    `insert into contracts (id, company_id, contract_no, contract_type, title,
                            counterparty_name, amount, signed_date, status,
                            created_by_user_id, created_by_name)
     values ('ct-ret', $1, 'HT-RET-001', 'purchase', '质保金测试合同', '某供应商',
             100000, '2025-01-01'::date, 'active', $2, '测试')
     on conflict (id) do nothing`,
    [COMPANY_ID, userId]
  );

  // 三个质保金期次：已到期未付、未到期、已到期已付清
  await pool.query(
    `insert into contract_payment_schedules
       (id, company_id, contract_id, period_no, title, due_date, amount_cents,
        schedule_type, retention_release_date)
     values
       ('cps-due',    $1, 'ct-ret', 1, '质保金-已到期', '2025-01-31'::date, 100000, 'retention', current_date - 1),
       ('cps-future', $1, 'ct-ret', 2, '质保金-未到期', '2025-01-31'::date, 200000, 'retention', current_date + 365),
       ('cps-paid',   $1, 'ct-ret', 3, '质保金-已付清', '2025-01-31'::date, 300000, 'retention', current_date - 1)
     on conflict (id) do nothing`,
    [COMPANY_ID]
  );

  // 给「已付清」那期造一条已确认的付款
  await pool.query(
    `insert into payments (id, company_id, payment_no, schedule_id, amount_cents,
                           paid_on, status, created_by_user_id)
     values ('pay-ret', $1, 'PAY-RET-0001', 'cps-paid', 300000, current_date, 'paid', $2)
     on conflict (id) do nothing`,
    [COMPANY_ID, userId]
  );

  await t.test("只为到期且未付清的质保金生成提醒", async () => {
    await scan({ id: "job-1", companyId: null, payload: null });

    const tasks = await pool.query<{ id: string; title: string; description: string }>(
      `select id, title, description from tasks where id like 'task-retention-%' order by id`
    );

    assert.equal(tasks.rows.length, 1, "只应为一条期次生成提醒");
    assert.equal(tasks.rows[0]!.id, "task-retention-cps-due");
    assert.match(tasks.rows[0]!.title, /HT-RET-001/, "标题应带合同号");
    assert.match(tasks.rows[0]!.description, /1000\.00 元/, "描述应带未付金额");
  });

  await t.test("未到期的不提醒", async () => {
    const future = await pool.query(
      `select 1 from tasks where id = 'task-retention-cps-future'`
    );
    assert.equal(future.rows.length, 0);
  });

  await t.test("已付清的不提醒——判据是账上的付款而不是状态字段", async () => {
    const paid = await pool.query(`select 1 from tasks where id = 'task-retention-cps-paid'`);
    assert.equal(paid.rows.length, 0);
  });

  await t.test("重复扫描不堆任务", async () => {
    // 扫描是定时跑的。不幂等的话一个月后任务中心里会有三十条一模一样的
    // 提醒，而真正该做的事被淹没在里面。
    await scan({ id: "job-2", companyId: null, payload: null });
    await scan({ id: "job-3", companyId: null, payload: null });

    const tasks = await pool.query(`select id from tasks where id like 'task-retention-%'`);
    assert.equal(tasks.rows.length, 1, "重复扫描不应产生第二条");
  });

  await t.test("部分付款仍提醒，且金额是剩余数", async () => {
    await pool.query(
      `insert into contract_payment_schedules
         (id, company_id, contract_id, period_no, title, due_date, amount_cents,
          schedule_type, retention_release_date)
       values ('cps-partial', $1, 'ct-ret', 4, '质保金-部分付', '2025-01-31'::date, 500000,
               'retention', current_date - 1)
       on conflict (id) do nothing`,
      [COMPANY_ID]
    );
    await pool.query(
      `insert into payments (id, company_id, payment_no, schedule_id, amount_cents,
                             paid_on, status, created_by_user_id)
       values ('pay-partial', $1, 'PAY-RET-0002', 'cps-partial', 200000, current_date, 'paid', $2)
       on conflict (id) do nothing`,
      [COMPANY_ID, userId]
    );

    await scan({ id: "job-4", companyId: null, payload: null });

    const task = await pool.query<{ description: string }>(
      `select description from tasks where id = 'task-retention-cps-partial'`
    );
    assert.equal(task.rows.length, 1, "部分付款的期次仍应提醒");
    // 5000 - 2000 = 3000
    assert.match(task.rows[0]!.description, /3000\.00 元/, "应提醒剩余金额而非期次全额");
  });

  await t.test("草稿状态的付款不算已付", async () => {
    // 与全局口径一致：钱还没出去。
    await pool.query(
      `insert into contract_payment_schedules
         (id, company_id, contract_id, period_no, title, due_date, amount_cents,
          schedule_type, retention_release_date)
       values ('cps-draftpay', $1, 'ct-ret', 5, '质保金-草稿付款', '2025-01-31'::date, 400000,
               'retention', current_date - 1)
       on conflict (id) do nothing`,
      [COMPANY_ID]
    );
    await pool.query(
      `insert into payments (id, company_id, payment_no, schedule_id, amount_cents,
                             paid_on, status, created_by_user_id)
       values ('pay-draft', $1, 'PAY-RET-0003', 'cps-draftpay', 400000, current_date, 'draft', $2)
       on conflict (id) do nothing`,
      [COMPANY_ID, userId]
    );

    await scan({ id: "job-5", companyId: null, payload: null });

    const task = await pool.query<{ description: string }>(
      `select description from tasks where id = 'task-retention-cps-draftpay'`
    );
    assert.equal(task.rows.length, 1, "草稿付款不该让提醒消失");
    assert.match(task.rows[0]!.description, /4000\.00 元/, "应按全额提醒");
  });
});
