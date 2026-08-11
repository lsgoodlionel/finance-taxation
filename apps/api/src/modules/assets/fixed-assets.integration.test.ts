/**
 * 固定资产的**路径级**断言（V12-C1）。
 *
 * 纯函数的折旧规则与处置分录方向已由 depreciation.test.ts / disposal.test.ts 钉住。
 * 这里测的是那些只有走通整条路径才会暴露的东西：迁移是否真的建了表、科目是否真的
 * seed 进了每家公司、唯一索引是否真的挡得住重复计提、处置前的折旧欠账检查是否
 * 真的拦得住。V12 的教训就是「纯函数一直对，错的是没人在写入路径上调它」。
 *
 * 覆盖：
 *   1. 建卡：开始折旧期间自动落在购置次月
 *   2. 折旧预览不落库；计提生成草稿凭证且借贷平衡
 *   3. 重复计提被拒（应用层 + 唯一索引）
 *   4. 期间锁挡住计提
 *   5. 处置前欠折旧被拒；补提后可处置
 *   6. 处置凭证借贷平衡，台账状态与日期同步更新
 *   7. 重复处置被拒
 *   8. 迁移 062 的两个科目已 seed 到既有公司
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
      return {
        statusCode,
        body: body ? (JSON.parse(body) as Record<string, unknown>) : null
      };
    }
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function createAsset(body: Record<string, unknown>) {
  const { createAssetRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await createAssetRoute(
    { method: "POST", url: "/api/assets", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function previewDepreciation(period: string) {
  const { previewDepreciationRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await previewDepreciationRoute(
    {
      method: "GET",
      url: `/api/assets/depreciation?period=${period}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function runDepreciationRequest(period: string) {
  const { runDepreciationRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await runDepreciationRoute(
    {
      method: "POST",
      url: "/api/assets/depreciation",
      auth: createAuthContext(),
      body: { period }
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function disposeRequest(assetId: string, body: Record<string, unknown>) {
  const { disposeAssetRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await disposeAssetRoute(
    {
      method: "POST",
      url: `/api/assets/${assetId}/dispose`,
      auth: createAuthContext(),
      body
    } as ApiRequest,
    capture.response,
    assetId
  );
  return capture.readJson();
}

/** 凭证的借贷合计，用于验证生成的凭证本身是平的。 */
async function voucherTotals(pool: pg.Pool, voucherId: string) {
  const result = await pool.query<{ debit: string; credit: string }>(
    `select coalesce(sum(debit),0)::text as debit, coalesce(sum(credit),0)::text as credit
     from voucher_lines where voucher_id = $1`,
    [voucherId]
  );
  const row = result.rows[0]!;
  return { debit: Number(row.debit), credit: Number(row.credit) };
}

/** 12 万设备、残值 6000、60 个月 → 月折旧 1900.00。2026-01 购入，2026-02 起提。 */
const EQUIPMENT = {
  assetNo: "FA-0001",
  name: "服务器一批",
  acquiredOn: "2026-01-15",
  originalCost: "120000.00",
  salvageValue: "6000.00",
  usefulLifeMonths: 60,
  expenseAccountCode: "6301e02"
};

test("固定资产台账、折旧计提与处置的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("迁移 062 的清理与处置损益科目已 seed 到既有公司", async () => {
    const result = await pool.query<{ code: string; category: string }>(
      `select code, category from accounts where company_id = $1 and code = any($2::text[]) order by code`,
      [COMPANY_ID, ["1606", "6115"]]
    );
    assert.deepEqual(
      result.rows.map((row) => row.code),
      ["1606", "6115"],
      "既有公司必须补齐这两个科目，否则处置凭证无处落脚"
    );
    assert.equal(
      result.rows.find((row) => row.code === "6115")?.category,
      "revenue",
      "资产处置损益归 revenue —— 准则把它列在营业利润的加项"
    );
  });

  await t.test("建卡：开始折旧期间自动落在购置次月", async () => {
    const created = await createAsset(EQUIPMENT);
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(
      created.body?.depreciationStartPeriod,
      "2026-02",
      "中国准则：当月增加的固定资产当月不提折旧"
    );
  });

  await t.test("资产编号重复被拒", async () => {
    const duplicate = await createAsset({ ...EQUIPMENT, name: "另一批" });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(duplicate.body?.code, "ASSET_NO_DUPLICATE");
  });

  await t.test("残值大于原值被拒", async () => {
    const invalid = await createAsset({
      ...EQUIPMENT,
      assetNo: "FA-BAD",
      salvageValue: "999999.00"
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body?.code, "ASSET_SALVAGE_INVALID");
  });

  await t.test("购置当月预览为 0，且预览不落库", async () => {
    const preview = await previewDepreciation("2026-01");
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.body?.totalAmount, "0.00");

    const rows = await pool.query(`select 1 from fixed_asset_depreciations where company_id = $1`, [
      COMPANY_ID
    ]);
    assert.equal(rows.rowCount, 0, "预览不得写入任何计提明细");
  });

  await t.test("次月计提：生成借贷平衡的草稿凭证", async () => {
    const run = await runDepreciationRequest("2026-02");
    assert.equal(run.statusCode, 201, JSON.stringify(run.body));
    assert.equal(run.body?.totalAmount, "1900.00");
    assert.equal(run.body?.accountingDate, "2026-02-28", "折旧凭证的会计日期取期间末日");

    const voucherId = String(run.body?.voucherId);
    const voucher = await pool.query<{ status: string; period: string }>(
      `select status, period from vouchers where id = $1`,
      [voucherId]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "折旧凭证是草稿，由人审核过账");

    const totals = await voucherTotals(pool, voucherId);
    assert.equal(totals.debit, totals.credit);
    assert.equal(totals.debit, 1900);
  });

  await t.test("重复计提被拒，且不产生第二张凭证", async () => {
    const again = await runDepreciationRequest("2026-02");
    assert.equal(again.statusCode, 409);
    assert.equal(again.body?.code, "DEPRECIATION_ALREADY_RUN");

    const vouchers = await pool.query(
      `select 1 from vouchers where company_id = $1 and source = 'depreciation'`,
      [COMPANY_ID]
    );
    assert.equal(vouchers.rowCount, 1);
  });

  await t.test("唯一索引在应用层之外兜底挡住重复计提", async () => {
    await assert.rejects(
      pool.query(
        `insert into fixed_asset_depreciations (id, company_id, asset_id, period, amount)
         values ($1, $2, $3, '2026-02', '1.00')`,
        ["fad-dup", COMPANY_ID, `fa-${COMPANY_ID}-FA-0001`]
      ),
      /uq_fixed_asset_depreciations_asset_period|duplicate key/
    );
  });

  await t.test("期间已锁账时拒绝计提", async () => {
    await pool.query(
      `insert into accounting_periods (company_id, period, is_locked)
       values ($1, '2026-03', true)
       on conflict (company_id, period) do update set is_locked = true`,
      [COMPANY_ID]
    );
    const locked = await runDepreciationRequest("2026-03");
    assert.equal(locked.statusCode, 409);
    assert.equal(locked.body?.code, "PERIOD_LOCKED");

    await pool.query(`update accounting_periods set is_locked = false where company_id = $1 and period = '2026-03'`, [
      COMPANY_ID
    ]);
  });

  await t.test("处置前当月折旧还欠着 → 拒绝处置", async () => {
    const blocked = await disposeRequest(`fa-${COMPANY_ID}-FA-0001`, {
      disposedOn: "2026-03-20",
      proceeds: "100000.00",
      proceedsAccountCode: "1002"
    });
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.body?.code, "DEPRECIATION_PENDING");
  });

  await t.test("补提当月折旧后可以处置，凭证借贷平衡", async () => {
    const march = await runDepreciationRequest("2026-03");
    assert.equal(march.statusCode, 201, JSON.stringify(march.body));

    // 累计已提两个月 = 3800.00，净值 = 120000 − 3800 = 116200.00
    const disposal = await disposeRequest(`fa-${COMPANY_ID}-FA-0001`, {
      disposedOn: "2026-03-20",
      proceeds: "100000.00",
      proceedsAccountCode: "1002"
    });
    assert.equal(disposal.statusCode, 201, JSON.stringify(disposal.body));
    assert.equal(disposal.body?.accumulatedDepreciation, "3800.00");
    assert.equal(disposal.body?.netBookValue, "116200.00");
    assert.equal(disposal.body?.gain, "-16200.00", "卖 10 万、净值 11.62 万 → 亏 1.62 万");

    const totals = await voucherTotals(pool, String(disposal.body?.voucherId));
    assert.equal(totals.debit, totals.credit);
  });

  await t.test("台账状态与处置日期同步更新", async () => {
    const asset = await pool.query<{ status: string; disposed_period: string }>(
      `select status, disposed_period from fixed_assets where id = $1`,
      [`fa-${COMPANY_ID}-FA-0001`]
    );
    assert.equal(asset.rows[0]?.status, "disposed");
    assert.equal(asset.rows[0]?.disposed_period, "2026-03");
  });

  await t.test("重复处置被拒", async () => {
    const again = await disposeRequest(`fa-${COMPANY_ID}-FA-0001`, { disposedOn: "2026-03-21" });
    assert.equal(again.statusCode, 409);
    assert.equal(again.body?.code, "ASSET_ALREADY_DISPOSED");
  });

  await t.test("处置次月不再计提折旧", async () => {
    const april = await runDepreciationRequest("2026-04");
    assert.equal(april.statusCode, 400);
    assert.equal(april.body?.code, "NO_DEPRECIABLE_ASSET", "唯一的资产已处置，本期无可提资产");
  });
});
