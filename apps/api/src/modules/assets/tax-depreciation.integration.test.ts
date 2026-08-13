/**
 * 折旧纳税调整明细表的路径级断言（V12-D4）。
 *
 * 税法规则由 tax-depreciation.test.ts 钉住。这里测的是取数：会计折旧从
 * C1 的计提明细汇总得对不对、税法分类的回落、一次性扣除的约束是否真的落到库上。
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
    userId: "usr-v4-tax",
    username: "v4_tax",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-tax"],
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

async function seedAsset(
  pool: pg.Pool,
  params: {
    id: string;
    assetNo: string;
    category: string;
    originalCost: string;
    lifeMonths: number;
    acquiredOn: string;
    oneTime?: boolean;
    taxCategory?: string | null;
  }
): Promise<void> {
  await pool.query(
    `insert into fixed_assets (
       id, company_id, asset_no, name, category, acquired_on, original_cost, salvage_value,
       useful_life_months, depreciation_start_period, expense_account_code,
       elects_one_time_deduction, tax_category
     ) values ($1, $2, $3, $3, $4, $5::date, $6::numeric, 0, $7, $8, '660202', $9, $10)`,
    [
      params.id,
      COMPANY_ID,
      params.assetNo,
      params.category,
      params.acquiredOn,
      params.originalCost,
      params.lifeMonths,
      `${params.acquiredOn.slice(0, 7)}`,
      params.oneTime ?? false,
      params.taxCategory ?? null
    ]
  );
}

/** 直接造会计折旧明细，避免依赖整条计提链路。 */
async function seedDepreciation(
  pool: pg.Pool,
  assetId: string,
  period: string,
  amount: string
): Promise<void> {
  await pool.query(
    `insert into fixed_asset_depreciations (id, company_id, asset_id, period, amount)
     values ($1, $2, $3, $4, $5::numeric)`,
    [`fad-${assetId}-${period}`, COMPANY_ID, assetId, period, amount]
  );
}

async function getReport(taxYear: number) {
  const { getTaxDepreciationRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await getTaxDepreciationRoute(
    {
      method: "GET",
      url: `/api/assets/tax-depreciation?taxYear=${taxYear}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("折旧纳税调整明细表的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("会计 3 年、税法 10 年的设备：调增", async () => {
    await seedAsset(pool, {
      id: "fa-tax-1",
      assetNo: "TAX-001",
      category: "equipment",
      originalCost: "120000.00",
      lifeMonths: 36,
      acquiredOn: "2026-01-15"
    });
    // 2026 年提了 11 个月（当月增加当月不提），每月 3333.33
    for (let month = 2; month <= 12; month += 1) {
      await seedDepreciation(pool, "fa-tax-1", `2026-${String(month).padStart(2, "0")}`, "3333.33");
    }

    const report = await getReport(2026);
    assert.equal(report.statusCode, 200, JSON.stringify(report.body));

    const row = (report.body?.rows as any[]).find((item) => item.assetNo === "TAX-001");
    assert.equal(row.accountingLifeMonths, 36);
    assert.equal(row.taxLifeMonths, 120, "税法最低 10 年");
    assert.equal(row.accountingDepreciation, "36666.63", "11 个月的会计折旧");
    assert.equal(row.taxDeduction, "12000.00", "税法年额 12 万 ÷ 10 年");
    assert.equal(row.adjustment, "24666.63", "正数=调增");
    assert.match(String(row.explanation), /纳税调增/);
  });

  await t.test("一次性扣除：购置当年全额扣原值，大额调减", async () => {
    await seedAsset(pool, {
      id: "fa-tax-2",
      assetNo: "TAX-002",
      category: "equipment",
      originalCost: "300000.00",
      lifeMonths: 60,
      acquiredOn: "2026-03-10",
      oneTime: true
    });
    for (let month = 4; month <= 12; month += 1) {
      await seedDepreciation(pool, "fa-tax-2", `2026-${String(month).padStart(2, "0")}`, "5000.00");
    }

    const report = await getReport(2026);
    const row = (report.body?.rows as any[]).find((item) => item.assetNo === "TAX-002");
    assert.equal(row.taxDeduction, "300000.00");
    assert.equal(row.accountingDepreciation, "45000.00");
    assert.equal(row.adjustment, "-255000.00", "负数=调减");
    assert.match(String(row.explanation), /纳税调减/);
  });

  await t.test("一次性扣除的次年：税法已扣完，会计折旧全额调增", async () => {
    for (let month = 1; month <= 12; month += 1) {
      await seedDepreciation(pool, "fa-tax-2", `2027-${String(month).padStart(2, "0")}`, "5000.00");
    }
    const report = await getReport(2027);
    const row = (report.body?.rows as any[]).find((item) => item.assetNo === "TAX-002");
    assert.equal(row.taxDeduction, "0.00");
    assert.equal(row.adjustment, "60000.00");
    assert.equal(row.reason, "one_time_deducted_prior_year");
  });

  await t.test("税法分类优先于会计分类", async () => {
    // 会计上归「办公设备」，税法上是电子设备（3 年）
    await seedAsset(pool, {
      id: "fa-tax-3",
      assetNo: "TAX-003",
      category: "office",
      taxCategory: "electronic",
      originalCost: "36000.00",
      lifeMonths: 36,
      acquiredOn: "2026-01-15"
    });

    const report = await getReport(2026);
    const row = (report.body?.rows as any[]).find((item) => item.assetNo === "TAX-003");
    assert.equal(row.category, "electronic", "税法分类优先");
    assert.equal(row.taxLifeMonths, 36, "电子设备 3 年，与会计年限一致");
    assert.equal(row.adjustment, "0.00");
  });

  await t.test("合计行与逐项相加一致", async () => {
    const report = await getReport(2026);
    const rows = report.body?.rows as any[];
    const sum = rows.reduce((acc, row) => acc + Number(row.adjustment), 0);
    assert.equal(sum.toFixed(2), report.body?.adjustmentTotal);
    assert.match(String(report.body?.summary), /纳税调[增减]/);
  });

  await t.test("购置日之后的年度才计入——尚未购置的资产不进表", async () => {
    await seedAsset(pool, {
      id: "fa-tax-future",
      assetNo: "TAX-FUTURE",
      category: "equipment",
      originalCost: "50000.00",
      lifeMonths: 60,
      acquiredOn: "2028-06-01"
    });
    const report = await getReport(2026);
    const codes = (report.body?.rows as any[]).map((row) => row.assetNo);
    assert.ok(!codes.includes("TAX-FUTURE"));
  });

  await t.test("超过 500 万仍勾一次性扣除会被数据库挡住", async () => {
    await assert.rejects(
      seedAsset(pool, {
        id: "fa-tax-big",
        assetNo: "TAX-BIG",
        category: "equipment",
        originalCost: "6000000.00",
        lifeMonths: 120,
        acquiredOn: "2026-01-15",
        oneTime: true
      }),
      /fixed_assets_one_time_deduction_limit|violates check constraint/,
      "超过 500 万还勾一次性扣除是录入错误，不是可接受的输入"
    );
  });

  await t.test("年份非法直接拒绝", async () => {
    const bad = await getReport(99);
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body?.code, "TAX_YEAR_INVALID");
  });
});
