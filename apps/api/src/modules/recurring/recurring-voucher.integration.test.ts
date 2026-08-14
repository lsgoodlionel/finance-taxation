/**
 * 定期凭证的路径级断言（V12-C4）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

// 纯函数也走动态 import：静态 import 会在下面这行 env 赋值**之前**就把
// db/client 拉起来（ESM 的 import 先于模块体执行），于是连不上库。
// 本仓其余集成测试一律动态 import，同一原因。

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

async function createTemplate(body: Record<string, unknown>) {
  const { createRecurringRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await createRecurringRoute(
    { method: "POST", url: "/api/recurring-vouchers", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function generate(period: string) {
  const { generateRecurringRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await generateRecurringRoute(
    {
      method: "POST",
      url: "/api/recurring-vouchers/generate",
      auth: createAuthContext(),
      body: { period }
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

const RENT_TEMPLATE = {
  name: "办公室房租",
  startPeriod: "2026-01",
  endPeriod: "2026-12",
  summaryTemplate: "计提办公室房租 {period}",
  // 660205 是管理费用-租金。此前写 660203——那是差旅费，与「办公室房租」这个
  // 模板名对不上（迁移 077 修复的名称错位）。
  lines: [
    { accountCode: "660205", debit: "20000.00", credit: "0.00" },
    { accountCode: "2202", debit: "0.00", credit: "20000.00" }
  ]
};

test("模板借贷平衡是纯判断", async () => {
  const { checkTemplateBalanced } = await import("./recurring-voucher.js");
  assert.equal(checkTemplateBalanced(RENT_TEMPLATE.lines).balanced, true);
  assert.equal(
    checkTemplateBalanced([{ accountCode: "1002", debit: "100", credit: "0" }]).balanced,
    false
  );
  assert.equal(
    checkTemplateBalanced([{ accountCode: "1002", debit: "0", credit: "0" }]).balanced,
    false,
    "全 0 的模板不算平衡"
  );
});

test("有效区间判定含边界，暂停的模板一律不在区间内", async () => {
  const { isPeriodInScope } = await import("./recurring-voucher.js");
  const scope = { startPeriod: "2026-01", endPeriod: "2026-12", status: "active" as const };
  assert.equal(isPeriodInScope(scope, "2026-01"), true, "开始期间当期即生效");
  assert.equal(isPeriodInScope(scope, "2026-12"), true, "结束期间当期仍生效");
  assert.equal(isPeriodInScope(scope, "2025-12"), false);
  assert.equal(isPeriodInScope(scope, "2027-01"), false);
  assert.equal(isPeriodInScope({ ...scope, status: "paused" }, "2026-06"), false);
  assert.equal(
    isPeriodInScope({ startPeriod: "2026-01", endPeriod: null, status: "active" }, "2099-12"),
    true,
    "无结束期间表示无限期"
  );
});

test("摘要模板替换所有 {period} 占位", async () => {
  const { renderSummary } = await import("./recurring-voucher.js");
  assert.equal(renderSummary("计提房租 {period}（{period} 属期）", "2026-06"), "计提房租 2026-06（2026-06 属期）");
});

test("定期凭证的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  let templateId = "";

  await t.test("借贷不平的模板被拒", async () => {
    const rejected = await createTemplate({
      ...RENT_TEMPLATE,
      lines: [
        { accountCode: "660205", debit: "20000.00", credit: "0.00" },
        { accountCode: "2202", debit: "0.00", credit: "18000.00" }
      ]
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "RECURRING_NOT_BALANCED");
    assert.match(String(rejected.body?.error), /每个月生成一张过不了账的草稿/);
  });

  await t.test("结束期间早于开始期间被拒", async () => {
    const rejected = await createTemplate({
      ...RENT_TEMPLATE,
      startPeriod: "2026-06",
      endPeriod: "2026-01"
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "RECURRING_PERIOD_ORDER");
  });

  await t.test("不存在的科目被闸门拦住", async () => {
    const rejected = await createTemplate({
      ...RENT_TEMPLATE,
      lines: [
        { accountCode: "9999", debit: "20000.00", credit: "0.00" },
        { accountCode: "2202", debit: "0.00", credit: "20000.00" }
      ]
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "ACCOUNT_NOT_FOUND");
  });

  await t.test("建模板成功，科目名由主数据补齐", async () => {
    const created = await createTemplate(RENT_TEMPLATE);
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    templateId = String(created.body?.id);
    const lines = created.body?.lines as { accountCode: string; accountName: string }[];
    assert.equal(lines.find((l) => l.accountCode === "2202")?.accountName, "应付账款");
  });

  await t.test("生成草稿凭证，会计日期取期间末日", async () => {
    const result = await generate("2026-06");
    assert.equal(result.statusCode, 200);
    assert.equal(result.body?.generated.length, 1);

    const voucherId = result.body?.generated[0].voucherId;
    const voucher = await pool.query<{ status: string; summary: string; accounting_date: string }>(
      `select status, summary, accounting_date::text from vouchers where id = $1`,
      [voucherId]
    );
    assert.equal(voucher.rows[0]?.status, "draft", "定期凭证是草稿，不自动过账");
    assert.equal(voucher.rows[0]?.summary, "计提办公室房租 2026-06");
    assert.equal(voucher.rows[0]?.accounting_date, "2026-06-30");

    const totals = await pool.query<{ debit: string; credit: string }>(
      `select sum(debit)::text as debit, sum(credit)::text as credit
       from voucher_lines where voucher_id = $1`,
      [voucherId]
    );
    assert.equal(totals.rows[0]?.debit, totals.rows[0]?.credit);
  });

  await t.test("重复生成不产生第二张凭证，并说明原因", async () => {
    const again = await generate("2026-06");
    assert.equal(again.body?.generated.length, 0);
    assert.equal(again.body?.skipped[0].skippedReason, "already_generated");

    const count = await pool.query(
      `select count(*)::text as n from vouchers where company_id = $1 and source = 'recurring'`,
      [COMPANY_ID]
    );
    assert.equal(count.rows[0]?.n, "1");
  });

  await t.test("区间外的期间不生成，原因是 out_of_scope", async () => {
    const outside = await generate("2027-01");
    assert.equal(outside.body?.generated.length, 0);
    assert.equal(outside.body?.skipped[0].skippedReason, "out_of_scope");
  });

  await t.test("暂停后不再生成", async () => {
    const { updateRecurringStatusRoute } = await import("./routes.js");
    const capture = createResponseCapture();
    await updateRecurringStatusRoute(
      {
        method: "PATCH",
        url: `/api/recurring-vouchers/${templateId}`,
        auth: createAuthContext(),
        body: { status: "paused" }
      } as ApiRequest,
      capture.response,
      templateId
    );
    assert.equal(capture.readJson().statusCode, 200);

    const paused = await generate("2026-07");
    assert.equal(paused.body?.generated.length, 0);
    assert.equal(paused.body?.skipped[0].skippedReason, "out_of_scope");
  });

  await t.test("恢复后可继续生成", async () => {
    const { updateRecurringStatusRoute } = await import("./routes.js");
    const capture = createResponseCapture();
    await updateRecurringStatusRoute(
      {
        method: "PATCH",
        url: `/api/recurring-vouchers/${templateId}`,
        auth: createAuthContext(),
        body: { status: "active" }
      } as ApiRequest,
      capture.response,
      templateId
    );
    assert.equal(capture.readJson().statusCode, 200);

    const resumed = await generate("2026-07");
    assert.equal(resumed.body?.generated.length, 1);
  });
});
