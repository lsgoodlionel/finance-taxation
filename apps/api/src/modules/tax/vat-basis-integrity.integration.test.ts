/**
 * 增值税底稿的金额来源与不完整拦截（V16 角色实验发现的阻断缺陷）。
 *
 * ## 缺陷
 *
 * `tax_items.basis` 一个字段承担了两件类型不同的事：
 *   - 生成侧写**政策依据散文**：「需结合交付、验收或约定开票条件确认纳税义务发生时点。」
 *   - 消费侧当**计税依据金额**：`Number(item.basis)`
 *
 * `Number("需结合交付…")` → `NaN`，一路流进底稿、申报向导、申报 XML：
 *
 * ```
 * GET /api/tax/vat-working-paper → {"outputTaxAmount":"NaN","payableVatAmount":"NaN"}
 * 导出的 XML → <本期销项税额>NaN</本期销项税额>
 * ```
 *
 * **那是报给税务局的数字**，而浏览器把这份文件正常下载了。
 *
 * ## 为什么此前没被发现
 *
 * 底稿模块自己的单元测试用 `basis: "1000"` 构造输入——一个干净的数字字符串。
 * 而生产环境里写进这个字段的从来都是散文。
 * **测试喂的输入不是系统真实产生的输入**，所以四条单测一直是绿的。
 *
 * ## 所以这条测试走真实生成路径
 *
 * 建事项 → analyze 派生税项 → 读底稿。中间不构造任何夹具数据，
 * 让系统自己产出税项，再看底稿算不算得出来。
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

function auth(role: string, userId: string): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId,
    username: userId.replace("usr-v4-", "v4_"),
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: [role],
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

test("增值税底稿的税额来自计税依据，不是把政策散文 Number() 成 NaN", async (t) => {
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

  // 底稿要求当期有生效的纳税人档案（决定税率口径），种子里 cmp-v4-tech 没有。
  await pool.query(
    `insert into taxpayer_profiles (id, company_id, taxpayer_type, effective_from, status, created_at, updated_at)
     values ('tp-vat-fixture',$1,'general_vat','2026-01-01'::date,'active', now(), now())`,
    [COMPANY_ID]
  );

  // ── 走真实路径：建事项 → 分析派生税项 ──────────────────────────────────
  const { createEvent, analyzeEvent } = await import("../events/routes.js");

  const eventCapture = capture();
  await createEvent(
    {
      method: "POST",
      url: "/api/events",
      body: {
        type: "contract_revenue",
        title: "[夹具] 增值税计税依据",
        occurredOn: `${PERIOD}-10`,
        description: "一笔 10000 元的收入",
        amount: "10000"
      },
      auth: auth("role-employee", "usr-v4-employee")
    } as ApiRequest,
    eventCapture.response
  );
  const created = eventCapture.read<{ id: string }>();
  assert.equal(created.statusCode, 201, "建事项应当成功");
  const eventId = created.body!.id;

  const analyzeCapture = capture();
  await analyzeEvent(
    {
      method: "POST",
      url: `/api/events/${eventId}/analyze`,
      body: {},
      auth: auth("role-accountant", "usr-v4-accountant")
    } as ApiRequest,
    analyzeCapture.response,
    eventId
  );
  assert.equal(analyzeCapture.read().statusCode, 200, "分析应当成功");

  // ── 落库的形状：basis 是散文，金额在专门的列 ────────────────────────────
  const stored = await pool.query<{ basis: string; taxable_amount_cents: string | null }>(
    `select basis, taxable_amount_cents from tax_items
      where business_event_id = $1 and tax_type = '增值税'`,
    [eventId]
  );
  assert.ok(stored.rows.length > 0, "分析应当派生出增值税税项");
  const row = stored.rows[0]!;

  assert.equal(
    Number.isFinite(Number(row.basis)),
    false,
    "basis 存的就是政策依据散文——这不是缺陷，缺陷是曾经有人拿它去算数"
  );
  // 增值税的计税依据是**不含税**销售额：合同收入 10000 元是含税价，
  // 按 6% 价税分离后不含税额 9433.96 元 = 943396 分。
  // 直接拿含税总额当计税依据会多算一截税——这是实务上最常见的错法之一。
  assert.equal(
    Number(row.taxable_amount_cents),
    943_396,
    "计税依据应当是价税分离后的不含税额，不是含税总额"
  );

  // ── 底稿：算得出真实数字，没有 NaN ──────────────────────────────────────
  const { getVatWorkingPaper } = await import("./routes.js");
  const paperCapture = capture();
  await getVatWorkingPaper(
    {
      method: "GET",
      url: `/api/tax/vat-working-paper?filingPeriod=${PERIOD}`,
      // 用会计而不是税务专员：v4_tax 属于 cmp-v4-service，
      // 而这条测试全程在 cmp-v4-tech。会计同样持有 tax.view。
      auth: auth("role-accountant", "usr-v4-accountant")
    } as ApiRequest,
    paperCapture.response
  );
  const paper = paperCapture.read<VatWorkingPaper>();
  assert.equal(paper.statusCode, 200);

  for (const field of [
    "outputTaxAmount",
    "inputTaxAmount",
    "simplifiedTaxAmount",
    "payableVatAmount"
  ] as const) {
    const value = paper.body![field];
    assert.equal(
      Number.isFinite(Number(value)),
      true,
      `${field} 必须是有限数，实际是 ${value}——NaN 会一路流进申报 XML`
    );
  }

  assert.notEqual(
    Number(paper.body!.outputTaxAmount),
    0,
    "10000 元收入应当算出销项税额，为 0 说明这条税项没被纳进来"
  );

  // 销项税额应当和「不含税额 × 税率」对得上，而不是任意一个非零数。
  const expectedOutput = (943_396 / 100) * (Number(paper.body!.lines[0]?.taxRate ?? 0) / 100);
  assert.ok(
    Math.abs(Number(paper.body!.outputTaxAmount) - expectedOutput) < 1,
    `销项税额应当约等于不含税额 × 税率（≈${expectedOutput.toFixed(2)}），` +
      `实际 ${paper.body!.outputTaxAmount}`
  );

  // ── 计税依据缺失的税项：不计入合计，但要显式列出 ────────────────────────
  //
  // 关键在于**它不能被当成 0 悄悄参与合计**——一份少算了一笔的申报表，
  // 没有提示就会被当成完整的报上去。
  await pool.query(
    `update tax_items set taxable_amount_cents = null
      where business_event_id = $1 and tax_type = '增值税'`,
    [eventId]
  );

  const afterCapture = capture();
  await getVatWorkingPaper(
    {
      method: "GET",
      url: `/api/tax/vat-working-paper?filingPeriod=${PERIOD}`,
      // 用会计而不是税务专员：v4_tax 属于 cmp-v4-service，
      // 而这条测试全程在 cmp-v4-tech。会计同样持有 tax.view。
      auth: auth("role-accountant", "usr-v4-accountant")
    } as ApiRequest,
    afterCapture.response
  );
  const after = afterCapture.read<VatWorkingPaper>();

  assert.ok(
    after.body!.incompleteTaxItemIds.length > 0,
    "计税依据缺失时必须把这些税项显式列出来"
  );
  assert.equal(
    Number.isFinite(Number(after.body!.payableVatAmount)),
    true,
    "缺失的行被排除后，合计仍然是个有限数（只是不完整）"
  );

  const missingLine = after.body!.lines.find((line) => line.basisMissing);
  assert.ok(missingLine, "缺失的行要标出来");
  assert.equal(
    missingLine!.taxableAmount,
    null,
    "计税依据缺失时是 null，不是 '0.00'——后者会让人以为这笔业务金额为零"
  );
});
