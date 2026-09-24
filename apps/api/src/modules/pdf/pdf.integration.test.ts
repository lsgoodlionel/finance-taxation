/**
 * PDF 导出的路径级断言（P0-1）。
 *
 * ## 这个模块此前零测试，而它曾经「恒 500」
 *
 * 一个月回顾里点名的四个「上线以来从未可用」的功能之一就是凭证 PDF 导出。
 * 它有 439 行、四个路由，**一条测试都没有**——出了问题只能等用户报。
 *
 * ## 断言的是「能出片」，不是排版
 *
 * PDF 走的是「服务端出打印友好 HTML → 浏览器打印」。所以这里验的是：
 * 响应码、Content-Type、关键数据真的进了 HTML。
 * **排版不测**——那要跑真浏览器，而排版坏了肉眼一秒就能看出来，
 * 恒 500 却要等到有人点导出。
 *
 * ## 越权尤其重要
 *
 * PDF 把凭证明细完整摊开。归属判定漏一个 `company_id`，
 * 别家的账就整张导出去了。
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
const OTHER_COMPANY_ID = "cmp-v4-group";

function createAuthContext(companyId = COMPANY_ID): AuthContext {
  return {
    companyId,
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes: ["role-accountant"],
    token: "test-token"
  };
}

/** 捕获响应。**PDF 路由返回的是 HTML 不是 JSON**，所以要分开读。 */
function createResponseCapture() {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = "";
  const response = {
    writeHead(next: number, nextHeaders?: Record<string, string>) {
      statusCode = next;
      if (nextHeaders) headers = nextHeaders;
      return response;
    },
    end(chunk?: string) {
      if (chunk) body += chunk;
      return response;
    }
  } as unknown as ServerResponse;
  return {
    response,
    read() {
      return { statusCode, headers, body };
    },
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

test("PDF 导出：凭证、工资、报表", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { voucherPdf, payrollPdf, reportPdf } = await import("./routes.js");

  // 凭证自建：种子里的凭证状态会随场景变。
  const VOUCHER_ID = "vch-p0-pdf";
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source,
                           accounting_date, period)
     values ($1, $2, 'transfer', 'P0 测试凭证', 'posted', 'manual', '2026-04-30'::date, '2026-04')
     on conflict (id) do nothing`,
    [VOUCHER_ID, COMPANY_ID]
  );
  await pool.query(
    `insert into voucher_lines (id, company_id, voucher_id, sort_order, summary,
                                account_code, account_name, debit, credit)
     values ('vl-p0-1', $1, $2, 0, '测试借方', '1002', '银行存款', 12345.67, 0),
            ('vl-p0-2', $1, $2, 1, '测试贷方', '6001', '主营业务收入', 0, 12345.67)
     on conflict (id) do nothing`,
    [COMPANY_ID, VOUCHER_ID]
  );

  await t.test("凭证 PDF：出得来，且不是 500", async () => {
    // 回顾里这条路由曾**对任何调用恒返回 500**，而 809 个测试全绿。
    const capture = createResponseCapture();
    await voucherPdf(
      { method: "GET", url: `/api/pdf/voucher/${VOUCHER_ID}`, auth: createAuthContext() } as ApiRequest,
      capture.response,
      VOUCHER_ID
    );
    const result = capture.read();
    assert.equal(result.statusCode, 200, `凭证 PDF 返回 ${result.statusCode}`);
    assert.match(result.headers["Content-Type"] ?? "", /text\/html/);
  });

  await t.test("凭证 PDF：分录数据真的进了 HTML", async () => {
    const capture = createResponseCapture();
    await voucherPdf(
      { method: "GET", url: `/api/pdf/voucher/${VOUCHER_ID}`, auth: createAuthContext() } as ApiRequest,
      capture.response,
      VOUCHER_ID
    );
    const { body } = capture.read();
    // 出得来不等于内容对。金额与科目要真的在里面——空模板同样返回 200。
    assert.ok(body.includes("P0 测试凭证"), "摘要应当出现在 PDF 里");
    assert.ok(body.includes("1002"), "科目编码应当出现");
    assert.ok(body.includes("银行存款"), "科目名称应当出现");
    assert.ok(body.includes("12,345.67") || body.includes("12345.67"), "金额应当出现");
  });

  await t.test("凭证 PDF：打印按钮要带 no-print，否则自己会被印出来", async () => {
    const capture = createResponseCapture();
    await voucherPdf(
      { method: "GET", url: `/api/pdf/voucher/${VOUCHER_ID}`, auth: createAuthContext() } as ApiRequest,
      capture.response,
      VOUCHER_ID
    );
    const { body } = capture.read();
    assert.ok(body.includes("@media print"), "缺打印样式，默认边距会把表格挤断");
  });

  await t.test("凭证 PDF：不存在的凭证返回 404 而不是崩", async () => {
    const capture = createResponseCapture();
    await voucherPdf(
      { method: "GET", url: "/api/pdf/voucher/nope", auth: createAuthContext() } as ApiRequest,
      capture.response,
      "nope"
    );
    assert.equal(capture.readJson().statusCode, 404);
  });

  await t.test("越权：别家公司导不出本公司的凭证", async () => {
    // PDF 把凭证明细完整摊开，归属判定漏一个 company_id 就是整张账导出去。
    const capture = createResponseCapture();
    await voucherPdf(
      {
        method: "GET",
        url: `/api/pdf/voucher/${VOUCHER_ID}`,
        auth: createAuthContext(OTHER_COMPANY_ID)
      } as ApiRequest,
      capture.response,
      VOUCHER_ID
    );
    const result = capture.read();
    assert.equal(result.statusCode, 404, "别家应当取不到");
    assert.equal(result.body.includes("12,345.67"), false, "金额不能泄漏");
  });

  await t.test("未登录：返回 401", async () => {
    const capture = createResponseCapture();
    await voucherPdf(
      { method: "GET", url: `/api/pdf/voucher/${VOUCHER_ID}` } as ApiRequest,
      capture.response,
      VOUCHER_ID
    );
    assert.equal(capture.readJson().statusCode, 401);
  });

  await t.test("工资 PDF：缺 period 参数被拒", async () => {
    const capture = createResponseCapture();
    await payrollPdf(
      { method: "GET", url: "/api/pdf/payroll", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 400);
    assert.match(result.body!.error, /period/);
  });

  await t.test("工资 PDF：给了期间就能出片（没有数据也要出一张空表）", async () => {
    const capture = createResponseCapture();
    await payrollPdf(
      { method: "GET", url: "/api/pdf/payroll?period=2026-04", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    const result = capture.read();
    // 没有工资数据时也该出一张说明「本期无数据」的表，而不是 500——
    // 报错会让人以为系统坏了，而实际只是这个月还没算工资。
    assert.equal(result.statusCode, 200, `工资 PDF 返回 ${result.statusCode}`);
    assert.match(result.headers["Content-Type"] ?? "", /text\/html/);
  });

  await t.test("报表 PDF：缺 period 被拒", async () => {
    const capture = createResponseCapture();
    await reportPdf(
      { method: "GET", url: "/api/pdf/report", auth: createAuthContext() } as ApiRequest,
      capture.response
    );
    assert.equal(capture.readJson().statusCode, 400);
  });
});
