/**
 * 附加税从实缴增值税算出来（V17 阶段三批次 B）。
 *
 * ## 缺陷
 *
 * `buildStampAndSurtaxSummary` 只把税种名含「附加」的税项筛出来展示，
 * 一分钱都不算——没人手工建税项，页面就永远是空的。
 *
 * ## 这条测试走完整条链
 *
 * 登记一笔增值税缴款 → 附加税按实缴额与所在地档位算出来。
 * 单验计算函数证明不了这个：缴款记录没读进来、或者读进来没传下去，
 * 用户看到的还是空页面。
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
const PERIOD = "2026-08";

type SurtaxSummary = {
  surtax: {
    kind: string;
    urbanConstructionCents: number | null;
    educationSurchargeCents: number | null;
    localEducationSurchargeCents: number | null;
    totalCents: number | null;
    reductionCents: number;
    reason: string;
  };
};

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

async function readSummary() {
  const { getStampAndSurtaxSummary } = await import("./routes.js");
  const c = capture();
  await getStampAndSurtaxSummary(
    {
      method: "GET",
      url: `/api/tax/stamp-surtax?filingPeriod=${PERIOD}`,
      auth: auth()
    } as ApiRequest,
    c.response
  );
  return c.read<SurtaxSummary>();
}

test("附加税按实缴增值税与所在地档位算出来", async (t) => {
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

  // ── 没有缴款记录：不估算 ────────────────────────────────────────────────
  //
  // **这是批次 B 最重要的一条。** 拿「应纳增值税」代替「实缴」得到的是
  // 近似值，而用户会拿它去申报——申报表上的数字必须是准的。
  await pool.query(`update companies set urban_construction_tax_zone = 'city' where id = $1`, [
    COMPANY_ID
  ]);
  const noPayment = await readSummary();
  assert.equal(noPayment.statusCode, 200);
  assert.equal(
    noPayment.body!.surtax.kind,
    "pending_main_tax",
    "没有缴款记录时不该给数字"
  );
  assert.equal(noPayment.body!.surtax.totalCents, null);

  // ── 登记一笔缴款：算出来 ────────────────────────────────────────────────
  await pool.query(
    `insert into tax_payments (id, company_id, tax_type, filing_period, amount_cents, paid_on)
     values ('tp-vat-1', $1, 'vat', $2, 100000, '2026-08-15'::date)`,
    [COMPANY_ID, PERIOD]
  );
  const paid = await readSummary();
  const surtax = paid.body!.surtax;

  assert.equal(surtax.kind, "calculated");
  assert.equal(surtax.urbanConstructionCents, 7000, "实缴 1000 元 × 市区 7% = 70 元");
  assert.equal(surtax.educationSurchargeCents, 3000, "教育费附加 3%");
  assert.equal(surtax.localEducationSurchargeCents, 2000, "地方教育附加 2%");
  assert.equal(surtax.totalCents, 12000, "合计 120 元");

  // ── 同期多笔缴款要合计 ──────────────────────────────────────────────────
  //
  // 分期缴纳是常见的。只取第一笔会算少，只取最后一笔也会算少。
  await pool.query(
    `insert into tax_payments (id, company_id, tax_type, filing_period, amount_cents, paid_on)
     values ('tp-vat-2', $1, 'vat', $2, 50000, '2026-08-25'::date)`,
    [COMPANY_ID, PERIOD]
  );
  const multi = await readSummary();
  assert.equal(
    multi.body!.surtax.urbanConstructionCents,
    10500,
    "两笔合计 1500 元 × 7% = 105 元——分期缴纳要合计，不能只取一笔"
  );

  // ── 别的税种的缴款不算进增值税的计税依据 ────────────────────────────────
  await pool.query(
    `insert into tax_payments (id, company_id, tax_type, filing_period, amount_cents, paid_on)
     values ('tp-cit-1', $1, 'cit', $2, 900000, '2026-08-26'::date)`,
    [COMPANY_ID, PERIOD]
  );
  const withCit = await readSummary();
  assert.equal(
    withCit.body!.surtax.urbanConstructionCents,
    10500,
    "企业所得税的缴款不是附加税的计税依据——混进来会算多好几倍"
  );

  // ── 所在地档位没登记时不猜 ──────────────────────────────────────────────
  //
  // 默认按市区 7% 会让县城企业多交 2 个点。
  await pool.query(`update companies set urban_construction_tax_zone = null where id = $1`, [
    COMPANY_ID
  ]);
  const noZone = await readSummary();
  assert.equal(noZone.body!.surtax.kind, "zone_unknown");
  assert.equal(noZone.body!.surtax.totalCents, null);
});
