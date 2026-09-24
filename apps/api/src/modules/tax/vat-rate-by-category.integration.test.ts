/**
 * 增值税税率按应税行为类别取，不是一律 13%（V17 阶段一）。
 *
 * ## 缺陷
 *
 * `resolveVatRateCode` 此前对一般纳税人一律返回 `vat_basic`（13%），
 * 不看业务性质。一家做咨询服务的公司（应适用 6%）会被按 13% 算，
 * **多算一倍还多**。税务专员在 V16 角色实验里报的就是这条。
 *
 * 代码里那段注释诚实地记着「服务业客户的底稿仍会按基本税率算……
 * 那是 D2 的后续项」——这次把它做完。
 *
 * ## 税率主数据本来就是对的
 *
 * `tax_rates` 里 13/9/6/5/3/0 六档齐全、适用范围写清楚、沿革也在。
 * 缺的一直是「这笔业务该用哪一档」的判定，以及**判定所需的信息**：
 * 公司没有行业字段，`business_events.type` 是记账口径不是税目口径。
 *
 * 政策依据与完整类别清单见 `docs/v17-tax-rate-policy/POLICY-MAP.md`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { VatWorkingPaper } from "@finance-taxation/domain-model";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";
const PERIOD = "2026-08";

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

async function readPaper() {
  const { getVatWorkingPaper } = await import("./routes.js");
  const c = capture();
  await getVatWorkingPaper(
    {
      method: "GET",
      url: `/api/tax/vat-working-paper?filingPeriod=${PERIOD}`,
      auth: auth()
    } as ApiRequest,
    c.response
  );
  return c.read<VatWorkingPaper>();
}

/**
 * 直接造税项，绕开事项派生——这条测试验的是**税率判定**，不是派生链路。
 *
 * 税项必须挂在真实的事项与映射上（外键约束），所以从种子里借一组现成的。
 */
async function seedTaxItem(
  pool: pg.Pool,
  id: string,
  category: string | null,
  amountCents = 1_000_000
) {
  // 从事项税务映射表取锚点：种子里 cmp-v4-tech 没有现成税项，
  // 但有映射（那是税项的来源）。
  const anchor = await pool.query<{ business_event_id: string; id: string }>(
    `select business_event_id, id from event_tax_mappings
      where company_id = $1 limit 1`,
    [COMPANY_ID]
  );
  assert.ok(anchor.rows[0], "种子里应当有事项税务映射可作锚点");
  const { business_event_id: eventId, id: mappingId } = anchor.rows[0]!;

  await pool.query(
    `insert into tax_items (
       id, company_id, business_event_id, mapping_id, tax_type, treatment, basis,
       taxable_amount_cents, taxable_category, filing_period, status, source,
       created_at, updated_at
     ) values ($1,$2,$3,$4,'增值税','确认销项税额',
               '需结合交付、验收或约定开票条件确认纳税义务发生时点。',
               $5,$6,$7,'pending','analysis', now(), now())`,
    [id, COMPANY_ID, eventId, mappingId, amountCents, category, PERIOD]
  );
}

test("增值税税率按应税行为类别取：服务业 6%、货物 13%、建筑 9%", async (t) => {
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

  await pool.query(
    `insert into taxpayer_profiles (id, company_id, taxpayer_type, effective_from, status, created_at, updated_at)
     values ('tp-rate-fixture',$1,'general_vat','2026-01-01'::date,'active', now(), now())`,
    [COMPANY_ID]
  );
  // 公司主营卖货，作为兜底。
  await pool.query(`update companies set default_taxable_category = 'goods' where id = $1`, [
    COMPANY_ID
  ]);

  // ── 一笔现代服务：必须按 6%，不是 13% ────────────────────────────────────
  //
  // **这就是缺陷本身**：此前一般纳税人一律 13%，服务业客户的税被多算一倍还多。
  await seedTaxItem(pool, "ti-service", "modern_service");
  const servicePaper = await readPaper();
  assert.equal(servicePaper.statusCode, 200);

  const serviceLine = servicePaper.body!.lines.find((l) => l.taxItemId === "ti-service");
  assert.ok(serviceLine, "应当有这一行");
  assert.equal(
    serviceLine!.taxRate,
    "6",
    `现代服务应当按 6% 算，实际 ${serviceLine!.taxRate}%——按 13% 会多收一倍还多的税`
  );

  // ── 建筑服务 9% ──────────────────────────────────────────────────────────
  await seedTaxItem(pool, "ti-construction", "construction");
  const constructionPaper = await readPaper();
  assert.equal(
    constructionPaper.body!.lines.find((l) => l.taxItemId === "ti-construction")?.taxRate,
    "9",
    "建筑服务适用 9%"
  );

  // ── 卖货 13% ────────────────────────────────────────────────────────────
  await seedTaxItem(pool, "ti-goods", "goods");
  const goodsPaper = await readPaper();
  assert.equal(
    goodsPaper.body!.lines.find((l) => l.taxItemId === "ti-goods")?.taxRate,
    "13",
    "销售货物仍然是 13%——这次改动不该让原本对的情形变错"
  );

  // ── 事项没标类别时回退到公司主营类别 ────────────────────────────────────
  await seedTaxItem(pool, "ti-fallback", null);
  const fallbackPaper = await readPaper();
  assert.equal(
    fallbackPaper.body!.lines.find((l) => l.taxItemId === "ti-fallback")?.taxRate,
    "13",
    "公司主营卖货，没标类别的按 13%"
  );
  assert.equal(
    fallbackPaper.body!.unknownCategoryTaxItemIds.includes("ti-fallback"),
    false,
    "回退到公司默认值算是确定的，不该报「待确认」"
  );

  // ── 两处都没有类别：报「税目待确认」，不猜 ──────────────────────────────
  //
  // 这是整个设计里最重要的一条：给一个默认档意味着一笔税目不明的业务
  // 会带着某个税率静默进申报表，而没人知道那个数字是猜的。
  await pool.query(`update companies set default_taxable_category = null where id = $1`, [
    COMPANY_ID
  ]);
  const unknownPaper = await readPaper();
  assert.ok(
    unknownPaper.body!.unknownCategoryTaxItemIds.includes("ti-fallback"),
    "公司也没配主营类别时，没标类别的税项必须报「税目待确认」"
  );

  const unknownLine = unknownPaper.body!.lines.find((l) => l.taxItemId === "ti-fallback");
  assert.equal(unknownLine!.categoryMissing, true, "行上要标出来");
  assert.notEqual(
    unknownLine!.taxRate,
    "13",
    "税目未知时不该显示一个看着合理的 13%——那正是此前的错法"
  );

  // 待确认的行不进合计。
  assert.equal(
    Number.isFinite(Number(unknownPaper.body!.payableVatAmount)),
    true,
    "排除待确认的行之后，合计仍是有限数（只是不完整）"
  );
});
