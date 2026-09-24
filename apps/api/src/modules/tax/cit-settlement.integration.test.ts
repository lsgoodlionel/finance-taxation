/**
 * 弥补以前年度亏损与已预缴抵减（V17 阶段三批次 C）。
 *
 * ## 两个缺陷
 *
 * 一、盈利年度的应纳税所得额**一分不减**：系统里没有以前年度亏损的台账，
 * 企业所得税法第十八条给的弥补权利用不上。
 *
 * 二、汇算时不抵减已预缴：`应补(退)税额 = 应纳税额 - 已预缴`，
 * 而系统只算应纳税额。企业按预缴过的金额再交一遍。
 *
 * ## 应退不能截断成 0
 *
 * 已预缴超过应纳税额时结果是**应退**，把它截断成 0 等于让企业白交。
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

/** 只有它有真实的已过账分录——v4 种子那两家一张凭证都没有，利润恒为 0。 */
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

test("以前年度亏损冲减应纳税所得额，已预缴从应纳税额里抵掉", async (t) => {
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

  // 登记一个明确走一般税率的资格，把税率这个变量固定下来。
  await pool.query(
    `update companies set employee_count = 500, total_assets_cents = 10000000000 where id = $1`,
    [COMPANY_ID]
  );

  // ── 基线 ────────────────────────────────────────────────────────────────
  //
  // **不写死利润数值**：种子的账随时会变，写死会让这条测试变成
  // 「种子没被改过」的哨兵，而它要验的是弥补与抵减的算法。
  // 下面全部用相对关系断言。
  const base = await readPreparation();
  assert.equal(base.statusCode, 200);
  const baseIncome = Number(base.body!.taxableIncomeEstimate);
  assert.ok(baseIncome > 1000, `种子账要有足够利润才验得出弥补，实际 ${baseIncome}`);
  assert.equal(base.body!.lossOffset, "0", "还没有台账，弥补额是 0");
  assert.equal(
    base.body!.taxableIncomeAfterLoss,
    base.body!.taxableIncomeEstimate,
    "没有可补的亏损时，弥补前后相等"
  );

  // ── 登记一笔以前年度亏损：300 元 ────────────────────────────────────────
  await pool.query(
    `insert into loss_carryforward_ledger (id, company_id, loss_year, loss_cents)
     values ('lcf-1', $1, 2024, 30000)`,
    [COMPANY_ID]
  );
  const withLoss = await readPreparation();

  assert.equal(withLoss.body!.lossOffset, "300", "用掉 300 元亏损额度");
  assert.equal(
    Number(withLoss.body!.taxableIncomeAfterLoss),
    baseIncome - 300,
    "**弥补后的余额才是计税基数**"
  );
  assert.equal(
    Number(withLoss.body!.prepaymentTaxEstimate),
    Math.round((baseIncome - 300) * 0.25 * 100) / 100,
    "税率作用在弥补后的基数上——先算税再减亏损会多缴 75 元（300 × 25%）"
  );
  assert.ok(
    Number(withLoss.body!.prepaymentTaxEstimate) < Number(base.body!.prepaymentTaxEstimate),
    "弥补之后税额必须变小，否则弥补权利等于没用上"
  );

  // ── 超期的亏损不能补，且要说出来 ────────────────────────────────────────
  //
  // 2019 年的亏损，一般企业结转 5 年，到 2024 年止。2026 年不能再补。
  await pool.query(
    `insert into loss_carryforward_ledger (id, company_id, loss_year, loss_cents)
     values ('lcf-old', $1, 2019, 100000)`,
    [COMPANY_ID]
  );
  const withExpired = await readPreparation();
  assert.equal(
    withExpired.body!.lossOffset,
    "300",
    "超期那笔不参与弥补——用它会少缴税，事后要补税加滞纳金"
  );
  assert.ok(
    withExpired.body!.expiredLossNotice.includes("2019"),
    "超期要说出来：一笔权利作废了，用户得知道，而不是让它悄悄消失"
  );

  // ── 已预缴抵减 ──────────────────────────────────────────────────────────
  await pool.query(
    `insert into tax_payments (id, company_id, tax_type, filing_period, amount_cents, paid_on)
     values ('txp-cit-1', $1, 'cit', $2, 8000, '2026-04-10'::date)`,
    [COMPANY_ID, PERIOD]
  );
  const withPrepaid = await readPreparation();
  const taxAmount = Number(withPrepaid.body!.prepaymentTaxEstimate);

  assert.equal(withPrepaid.body!.prepaidTax, "80", "已预缴 80 元");
  assert.equal(
    Number(withPrepaid.body!.taxPayableOrRefundable),
    taxAmount - 80,
    "应补 = 应纳税额 - 已预缴"
  );

  // ── 预缴超过应纳税额时是应退，不是 0 ────────────────────────────────────
  //
  // **把它截断成 0 等于让企业白交。**
  // 预缴金额要大于应纳税额才验得到「应退」。
  await pool.query(
    `insert into tax_payments (id, company_id, tax_type, filing_period, amount_cents, paid_on)
     values ('txp-cit-3', $1, 'cit', $2, $3, '2026-04-25'::date)`,
    [COMPANY_ID, PERIOD, Math.round(taxAmount * 100) + 100_00]
  );
  const overpaid = await readPreparation();

  assert.ok(
    Number(overpaid.body!.taxPayableOrRefundable) < 0,
    `预缴超过应纳税额时结果是**应退**（负数），实际 ${overpaid.body!.taxPayableOrRefundable}——截断成 0 等于让企业白交`
  );
  assert.equal(
    Number(overpaid.body!.taxPayableOrRefundable),
    taxAmount - Number(overpaid.body!.prepaidTax),
    "应退额 = 应纳税额 - 已预缴，符号不做任何处理"
  );
});
