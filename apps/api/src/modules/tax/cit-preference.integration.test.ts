/**
 * 企业所得税优惠一路走到汇算准备（V17 阶段三批次 A）。
 *
 * ## 缺陷
 *
 * `buildCorporateIncomeTaxPreparation` 写死 `const incomeTaxRate = 25`。
 * 一家小型微利企业（实际税负 5%）会按 25% 预缴，**多交五倍**。
 * 高新技术企业（15%）同理。
 *
 * ## 单验判定函数不够
 *
 * 判定函数对了，但公司资格档案没读进来、或者读进来没传下去，
 * 用户看到的还是 25%——而页面看起来一切正常。这条测试走完整条链。
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { CorporateIncomeTaxPreparation } from "@finance-taxation/domain-model";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

/**
 * 用 `cmp-tech-001` 而不是 v4 验收种子的公司：**只有它有真实的已过账分录**
 * （v4 种子那两家一张凭证都没有，利润恒为 0，走不到税率判定这一段）。
 *
 * 期间取 2026-04——那个月有 5 张凭证。
 */
const COMPANY_ID = "cmp-tech-001";
const PERIOD = "2026-04";

function auth(): AuthContext {
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

function capture() {
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
    read<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

async function readPreparation() {
  const { getCorporateIncomeTaxPreparation } = await import("./routes.js");
  const c = capture();
  await getCorporateIncomeTaxPreparation(
    {
      method: "GET",
      url: `/api/tax/corporate-income-tax?filingPeriod=${PERIOD}`,
      auth: auth()
    } as ApiRequest,
    c.response
  );
  return c.read<CorporateIncomeTaxPreparation>();
}

test("企业所得税按优惠资格算，不是一律 25%", async (t) => {
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

  // ── 资格没登记：不按 25% 兜底 ────────────────────────────────────────────
  //
  // **这是最重要的一条。** 按最高档兜底看起来保守稳妥，实际是静默地
  // 让本该按 5% 的企业多交五倍，而用户看不出这个数字是猜的。
  const bare = await readPreparation();
  assert.equal(bare.statusCode, 200);
  assert.equal(
    bare.body!.incomeTaxRate,
    null,
    "没登记从业人数与资产总额时不给税率——此前这里是写死的 25%"
  );
  assert.match(
    bare.body!.preferenceNotice ?? "",
    /从业人数|资产总额/,
    "要说清缺哪一项，用户得知道去补什么"
  );

  // ── 登记成小型微利 ──────────────────────────────────────────────────────
  await pool.query(
    `update companies
        set employee_count = 50,
            total_assets_cents = 100000000,
            is_restricted_industry = false
      where id = $1`,
    [COMPANY_ID]
  );
  const smallProfit = await readPreparation();
  assert.equal(
    smallProfit.body!.incomeTaxRate,
    "5",
    `小型微利实际税负 5%，实际 ${smallProfit.body!.incomeTaxRate}——按 25% 会多交五倍`
  );
  assert.equal(
    smallProfit.body!.reducedInclusionPercent,
    "25",
    "两个系数要分别列出：减按 25% 计入应纳税所得额"
  );
  assert.equal(smallProfit.body!.appliedRatePercent, "20", "按 20% 税率征收");

  // ── 登记高新资质 ────────────────────────────────────────────────────────
  await pool.query(
    `update companies set high_tech_certificate_expires_on = '2027-12-31'::date where id = $1`,
    [COMPANY_ID]
  );
  const highTech = await readPreparation();
  assert.equal(highTech.body!.incomeTaxRate, "15", "高新技术企业按 15%");

  // ── 资质过期后不再享受 ──────────────────────────────────────────────────
  //
  // 过期仍按 15% 算不是「对客户好」，是把补税和滞纳金推给以后。
  await pool.query(
    `update companies set high_tech_certificate_expires_on = '2020-12-31'::date where id = $1`,
    [COMPANY_ID]
  );
  const expired = await readPreparation();
  assert.notEqual(expired.body!.incomeTaxRate, "15", "过期的资质不该还按 15% 算");
});
