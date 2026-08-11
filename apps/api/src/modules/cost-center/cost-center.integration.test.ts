/**
 * 成本中心的路径级断言（V12-D1）。
 *
 * 汇总与适用判定由 cost-center.test.ts 钉住。这里测的是只有连库才成立的部分：
 * 维度有没有真的随凭证过账进总账、取数是不是只取费用类且排除了结转分录、
 * 编码复用有没有被挡住。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

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
    readJson() {
      return { statusCode, body: body ? (JSON.parse(body) as Record<string, any>) : null };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function createCostCenter(body: Record<string, unknown>) {
  const { createCostCenterRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await createCostCenterRoute(
    { method: "POST", url: "/api/cost-centers", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function getReport(period: string) {
  const { getCostCenterReportRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await getCostCenterReportRoute(
    {
      method: "GET",
      url: `/api/reports/cost-centers?period=${period}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

/** 造一条带成本中心的费用分录。 */
async function seedExpense(
  pool: pg.Pool,
  params: {
    id: string;
    accountCode: string;
    amount: string;
    costCenterId: string | null;
    entryDate: string;
    source?: string;
  }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', '测试', 'posted', 'test', $3::date, $4, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, params.entryDate, params.entryDate.slice(0, 7)]
  );
  const account = await pool.query<{ name: string }>(
    `select name from accounts where company_id = $1 and code = $2`,
    [COMPANY_ID, params.accountCode]
  );
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, business_event_id, entry_date, summary,
       account_code, account_name, debit, credit, source, posted_at, cost_center_id
     ) values ($1, $2, $3, null, $4::date, '测试费用', $5, $6, $7::numeric, 0, $8, now(), $9)`,
    [
      params.id,
      COMPANY_ID,
      voucherId,
      params.entryDate,
      params.accountCode,
      account.rows[0]?.name ?? params.accountCode,
      params.amount,
      params.source ?? "voucher_posting",
      params.costCenterId
    ]
  );
}

test("成本中心的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("新建成本中心，可关联部门", async () => {
    const sales = await createCostCenter({ code: "CC-SALES", name: "销售部" });
    assert.equal(sales.statusCode, 201, JSON.stringify(sales.body));
    assert.equal(sales.body?.isActive, true);

    const rd = await createCostCenter({ code: "CC-RD", name: "研发部" });
    assert.equal(rd.statusCode, 201);
  });

  await t.test("编码重复被拒", async () => {
    const dup = await createCostCenter({ code: "CC-SALES", name: "销售二部" });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.body?.code, "COST_CENTER_CODE_DUPLICATE");
  });

  await t.test("停用后编码仍被占用，且理由说得明白", async () => {
    const { setCostCenterActive } = await import("./cost-center-store.js");
    await setCostCenterActive(COMPANY_ID, `cc-${COMPANY_ID}-CC-RD`, false);

    const reuse = await createCostCenter({ code: "CC-RD", name: "新研发部" });
    assert.equal(reuse.statusCode, 409);
    assert.match(String(reuse.body?.error), /历史分录还指着它/);

    await setCostCenterActive(COMPANY_ID, `cc-${COMPANY_ID}-CC-RD`, true);
  });

  await t.test("默认只列启用的，带参数才列停用的", async () => {
    const { setCostCenterActive, listCostCenters } = await import("./cost-center-store.js");
    await setCostCenterActive(COMPANY_ID, `cc-${COMPANY_ID}-CC-RD`, false);

    const active = await listCostCenters(COMPANY_ID);
    assert.ok(!active.some((item) => item.code === "CC-RD"));

    const all = await listCostCenters(COMPANY_ID, { includeInactive: true });
    assert.ok(all.some((item) => item.code === "CC-RD"));

    await setCostCenterActive(COMPANY_ID, `cc-${COMPANY_ID}-CC-RD`, true);
  });

  await t.test("按成本中心汇总费用，未指定的单列", async () => {
    const sales = `cc-${COMPANY_ID}-CC-SALES`;
    const rd = `cc-${COMPANY_ID}-CC-RD`;
    await seedExpense(pool, { id: "le-cc-1", accountCode: "6301e03", amount: "30000.00", costCenterId: sales, entryDate: "2026-08-05" });
    await seedExpense(pool, { id: "le-cc-2", accountCode: "6301e01", amount: "20000.00", costCenterId: sales, entryDate: "2026-08-06" });
    await seedExpense(pool, { id: "le-cc-3", accountCode: "6301e03", amount: "40000.00", costCenterId: rd, entryDate: "2026-08-07" });
    await seedExpense(pool, { id: "le-cc-4", accountCode: "6301e03", amount: "10000.00", costCenterId: null, entryDate: "2026-08-08" });

    const report = await getReport("2026-08");
    assert.equal(report.statusCode, 200, JSON.stringify(report.body));
    assert.equal(report.body?.total, "100000.00");
    assert.equal(report.body?.unassigned, "10000.00");

    const rows = report.body?.rows as any[];
    const sum = rows.reduce((acc, row) => acc + Number(row.total), 0);
    assert.equal(sum.toFixed(2), report.body?.total, "分部门合计必须等于总额");
    assert.ok(rows.some((row) => row.costCenterId === null), "未指定单列，不丢弃也不摊派");
  });

  await t.test("非费用科目不进部门报表", async () => {
    const sales = `cc-${COMPANY_ID}-CC-SALES`;
    // 银行存款带上成本中心也不该出现——这个维度对它没有意义
    await seedExpense(pool, { id: "le-cc-bank", accountCode: "1002", amount: "999999.00", costCenterId: sales, entryDate: "2026-08-09" });

    const report = await getReport("2026-08");
    assert.equal(report.body?.total, "100000.00", "银行存款不是费用");
  });

  await t.test("所得税费用不进部门报表", async () => {
    const sales = `cc-${COMPANY_ID}-CC-SALES`;
    await seedExpense(pool, { id: "le-cc-tax", accountCode: "6801", amount: "50000.00", costCenterId: sales, entryDate: "2026-08-10" });

    const report = await getReport("2026-08");
    assert.equal(
      report.body?.total,
      "100000.00",
      "公司整体税负摊到部门头上，会让部门多出一块既不能控制也无法解释的数字"
    );
  });

  await t.test("结转分录不算本期费用", async () => {
    await seedExpense(pool, {
      id: "le-cc-closing",
      accountCode: "6301e03",
      amount: "77777.00",
      costCenterId: null,
      entryDate: "2026-08-31",
      source: "period_closing"
    });

    const report = await getReport("2026-08");
    assert.equal(
      report.body?.total,
      "100000.00",
      "算进来会让每个部门的费用在结转后变成 0"
    );
  });

  await t.test("未指定比例超阈值时给出提示", async () => {
    const report = await getReport("2026-08");
    // 未指定 1 万 / 总额 10 万 = 10%，恰好触及阈值
    assert.match(String(report.body?.unassignedNotice), /10\.0%/);
  });

  await t.test("维度随凭证过账进总账", async () => {
    const row = await pool.query<{ cost_center_id: string }>(
      `select cost_center_id from ledger_entries where id = 'le-cc-1'`
    );
    assert.equal(row.rows[0]?.cost_center_id, `cc-${COMPANY_ID}-CC-SALES`);
  });

  await t.test("期间格式非法直接拒绝", async () => {
    const report = await getReport("2026-8");
    assert.equal(report.statusCode, 400);
    assert.equal(report.body?.code, "PERIOD_INVALID");
  });
});
