/**
 * 税款缴纳记录能录（V17 阶段三批次 B）。
 *
 * ## 为什么这条不能省
 *
 * 附加税以实缴增值税为计税依据。缴款记录**只能改库**的话，
 * 所有公司的附加税都停在「待主税缴纳后计算」——比之前那个
 * 一分钱不算的空页面还难解释：用户会以为系统坏了。
 *
 * V17 阶段一、二都踩过这个：判定链路打通了，界面上没有入口。
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

function auth(roleCodes = ["role-accountant"]): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes,
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

type Payment = {
  id: string;
  taxType: string;
  filingPeriod: string;
  amountCents: number;
  paidOn: string;
};

async function create(body: Record<string, unknown>) {
  const { createTaxPayment } = await import("./tax-payment.routes.js");
  const c = capture();
  await createTaxPayment(
    { method: "POST", url: "/api/tax/payments", body, auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<Payment & { error?: string; code?: string }>();
}

async function list(period = PERIOD) {
  const { listTaxPayments } = await import("./tax-payment.routes.js");
  const c = capture();
  await listTaxPayments(
    {
      method: "GET",
      url: `/api/tax/payments?filingPeriod=${period}`,
      auth: auth()
    } as ApiRequest,
    c.response
  );
  return c.read<{ items: Payment[] }>();
}

test("税款缴纳记录能录能查", async (t) => {
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

  // ── 录一笔 ──────────────────────────────────────────────────────────────
  const created = await create({
    taxType: "vat",
    filingPeriod: PERIOD,
    amountCents: 100_000,
    paidOn: "2026-08-15",
    note: "8 月增值税"
  });
  assert.equal(created.statusCode, 201, `应当建成功：${created.body?.error ?? ""}`);

  const listed = await list();
  assert.equal(listed.body!.items.length, 1);
  assert.equal(listed.body!.items[0]!.amountCents, 100_000);
  assert.equal(listed.body!.items[0]!.paidOn, "2026-08-15", "缴款日要按日期原样返回");

  // ── 金额必须是正数 ──────────────────────────────────────────────────────
  //
  // 负数缴款在业务上是退税，那是另一件事，不能混进「实缴」——
  // 混进来会把附加税的计税依据算小。
  const negative = await create({
    taxType: "vat",
    filingPeriod: PERIOD,
    amountCents: -1000,
    paidOn: "2026-08-15"
  });
  assert.equal(negative.statusCode, 400, "负数金额应当被拒");
  assert.equal(negative.body!.code, "TAX_PAYMENT_INVALID");

  // ── 缴款日必填且合法 ────────────────────────────────────────────────────
  //
  // 缴款日决定这笔计入哪一期。没有它就不知道该归到哪个属期，
  // 附加税算出来会挂错期。
  const noDate = await create({
    taxType: "vat",
    filingPeriod: PERIOD,
    amountCents: 1000
  });
  assert.equal(noDate.statusCode, 400, "缴款日必填");

  const badDate = await create({
    taxType: "vat",
    filingPeriod: PERIOD,
    amountCents: 1000,
    paidOn: "八月十五"
  });
  assert.equal(badDate.statusCode, 400, "缴款日要是 YYYY-MM-DD");

  // ── 属期必填 ────────────────────────────────────────────────────────────
  const noPeriod = await create({
    taxType: "vat",
    amountCents: 1000,
    paidOn: "2026-08-15"
  });
  assert.equal(noPeriod.statusCode, 400, "属期必填——附加税按属期取计税依据");

  // ── 只列本属期的 ────────────────────────────────────────────────────────
  await create({
    taxType: "vat",
    filingPeriod: "2026-07",
    amountCents: 50_000,
    paidOn: "2026-07-15"
  });
  const august = await list("2026-08");
  assert.equal(august.body!.items.length, 1, "查 8 月不该带出 7 月的");
});

test("登记缴款之后附加税就算得出来了", async (t) => {
  // **这是这条链路的意义**：录入 → 附加税从「待主税缴纳后计算」变成有数字。
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

  await pool.query(`update companies set urban_construction_tax_zone = 'county' where id = $1`, [
    COMPANY_ID
  ]);

  const { getStampAndSurtaxSummary } = await import("./routes.js");

  const before = capture();
  await getStampAndSurtaxSummary(
    {
      method: "GET",
      url: `/api/tax/stamp-surtax?filingPeriod=${PERIOD}`,
      auth: auth()
    } as ApiRequest,
    before.response
  );
  assert.equal(
    before.read<{ surtax: { kind: string } }>().body!.surtax.kind,
    "pending_main_tax",
    "录之前算不出"
  );

  await create({
    taxType: "vat",
    filingPeriod: PERIOD,
    amountCents: 200_000,
    paidOn: "2026-08-20"
  });

  const after = capture();
  await getStampAndSurtaxSummary(
    {
      method: "GET",
      url: `/api/tax/stamp-surtax?filingPeriod=${PERIOD}`,
      auth: auth()
    } as ApiRequest,
    after.response
  );
  const surtax = after.read<{
    surtax: { kind: string; urbanConstructionCents: number | null };
  }>().body!.surtax;

  assert.equal(surtax.kind, "calculated", "录完就算得出来");
  assert.equal(surtax.urbanConstructionCents, 10_000, "实缴 2000 元 × 县城 5% = 100 元");
});
