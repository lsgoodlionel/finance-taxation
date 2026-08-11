/**
 * 税率主数据的路径级断言（V12-D2）。
 *
 * 解析规则由 tax-rate.test.ts 钉住。这里验证的是**迁移里那批内置数据本身对不对**
 * ——税率沿革是外部事实，写错一个日期，整个模块的正确性就没了意义，
 * 而纯函数测试用的是手写数据，永远发现不了迁移里的笔误。
 */

import assert from "node:assert/strict";
import test from "node:test";
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

async function listRates(qs: string) {
  const { listTaxRatesRoute } = await import("./tax-rate.routes.js");
  const capture = createResponseCapture();
  await listTaxRatesRoute(
    { method: "GET", url: `/api/tax/rates?${qs}`, auth: createAuthContext() } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function createRate(body: Record<string, unknown>) {
  const { createTaxRateRoute } = await import("./tax-rate.routes.js");
  const capture = createResponseCapture();
  await createTaxRateRoute(
    { method: "POST", url: "/api/tax/rates", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("税率主数据的完整路径", async (t) => {
  await prepareDatabase();

  t.after(async () => {
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await t.test("迁移内置了增值税税率沿革，历史档保留", async () => {
    const all = await listRates("taxType=vat");
    assert.equal(all.statusCode, 200);
    const basic = (all.body?.items as any[]).filter((item) => item.code === "vat_basic");
    assert.deepEqual(
      basic.map((item) => item.rate).sort((a, b) => a - b),
      [13, 16, 17],
      "17→16→13 三档都要在，重算旧期间的底稿需要它们"
    );
  });

  await t.test("按日期取税率：2017 年是 17%，2018 年 16%，今天 13%", async () => {
    const { listTaxRates } = await import("./tax-rate-store.js");
    const { resolveTaxRate } = await import("./tax-rate.js");
    const rates = await listTaxRates(COMPANY_ID, "vat");
    const at = (on: string) => resolveTaxRate(rates, { taxType: "vat", code: "vat_basic", on })?.rate;

    assert.equal(at("2017-06-15"), 17);
    assert.equal(at("2018-06-15"), 16);
    assert.equal(at("2026-06-15"), 13);
    assert.equal(at("2018-04-30"), 17, "改版前一天仍是旧税率");
    assert.equal(at("2018-05-01"), 16, "改版当天即适用新税率");
  });

  await t.test("小规模纳税人当前减按 1% 征收", async () => {
    const { listTaxRates } = await import("./tax-rate-store.js");
    const { resolveTaxRate, effectiveRateOf, describeRate } = await import("./tax-rate.js");
    const rates = await listTaxRates(COMPANY_ID, "vat");

    const now = resolveTaxRate(rates, {
      taxType: "vat",
      code: "vat_small",
      on: "2026-06-15",
      taxpayerType: "small_scale"
    })!;
    assert.equal(now.rate, 3, "法定征收率仍是 3%");
    assert.equal(effectiveRateOf(now), 1, "实际征收 1%——按 3% 算就是让客户多缴税");
    assert.equal(describeRate(now), "3% 征收率，减按 1% 征收");

    const before = resolveTaxRate(rates, {
      taxType: "vat",
      code: "vat_small",
      on: "2022-06-15",
      taxpayerType: "small_scale"
    })!;
    assert.equal(effectiveRateOf(before), 3, "减征 2023 年才开始");
  });

  await t.test("带 on 的列表只给当日生效的那几档", async () => {
    const today = await listRates("taxType=vat&on=2026-06-15");
    const rates = (today.body?.items as any[]).map((item) => item.rate);
    assert.ok(!rates.includes(17), "2026 年的税率选择器不该出现 17%");
    assert.ok(!rates.includes(16), "也不该出现 16%");
    assert.ok(rates.includes(13) && rates.includes(9) && rates.includes(6), "13/9/6 三档都要在");

    const y2017 = await listRates("taxType=vat&on=2017-06-15");
    const old = (y2017.body?.items as any[]).map((item) => item.rate);
    assert.ok(old.includes(17) && old.includes(11), "2017 年是 17% 与 11%");
    assert.ok(!old.includes(13), "2017 年还没有 13%");
  });

  await t.test("9% 与 6% 存在——服务业不该再被按 13% 算", async () => {
    const today = await listRates("taxType=vat&on=2026-06-15");
    const byCode = new Map((today.body?.items as any[]).map((item) => [item.code, item]));
    assert.equal(byCode.get("vat_low")?.rate, 9);
    assert.equal(byCode.get("vat_service")?.rate, 6);
    assert.match(String(byCode.get("vat_low")?.applicableScope), /交通运输|建筑/);
  });

  await t.test("公司自定义税率可新增，且系统内置仍可见", async () => {
    const created = await createRate({
      taxType: "vat",
      code: "vat_custom_core",
      name: "核定征收率 2%",
      rate: 2,
      effectiveFrom: "2026-01-01",
      applicableScope: "税务机关核定的特殊征收率"
    });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(created.body?.isSystem, false);

    const all = await listRates("taxType=vat");
    const codes = (all.body?.items as any[]).map((item) => item.code);
    assert.ok(codes.includes("vat_custom_core"));
    assert.ok(codes.includes("vat_basic"), "自定义税率不会遮蔽系统内置");
  });

  await t.test("同一 code 的生效区间重叠被拒", async () => {
    const overlapping = await createRate({
      taxType: "vat",
      code: "vat_custom_core",
      name: "核定征收率 2.5%",
      rate: 2.5,
      effectiveFrom: "2026-06-01"
    });
    assert.equal(overlapping.statusCode, 409);
    assert.equal(overlapping.body?.code, "TAX_RATE_OVERLAPS");
    assert.match(String(overlapping.body?.error), /同一档税率在同一天只能有一个值/);
  });

  await t.test("实际征收率高于法定税率被拒", async () => {
    const invalid = await createRate({
      taxType: "vat",
      code: "vat_bad",
      name: "不合理的减征",
      rate: 3,
      levyRate: 5,
      effectiveFrom: "2026-01-01"
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body?.code, "TAX_RATE_RANGE_INVALID");
    assert.match(String(invalid.body?.error), /减征只会往下减/);
  });

  await t.test("封口后可新增同 code 的下一档", async () => {
    const { expireTaxRate } = await import("./tax-rate-store.js");
    const expired = await expireTaxRate(
      COMPANY_ID,
      `rate-${COMPANY_ID}-vat_custom_core-2026-01-01`,
      "2026-05-31"
    );
    assert.equal(expired, true);

    const next = await createRate({
      taxType: "vat",
      code: "vat_custom_core",
      name: "核定征收率 2.5%",
      rate: 2.5,
      effectiveFrom: "2026-06-01"
    });
    assert.equal(next.statusCode, 201, "封口旧行后同 code 可以接着往下排");
  });

  await t.test("系统内置税率不可被公司封口", async () => {
    const { expireTaxRate } = await import("./tax-rate-store.js");
    const blocked = await expireTaxRate(COMPANY_ID, "rate-vat-basic-2019", "2026-12-31");
    assert.equal(blocked, false, "内置税率的沿革由迁移维护，全租户共享，不能被单个公司改掉");
  });
});
