/**
 * 凭证会计日期的落库口径（V16）。
 *
 * ## 这个文件是为一个静默数错的 bug 写的
 *
 * 建凭证时 `insert into vouchers (...)` 的字段列表里**漏了 `accounting_date`**。
 * 那一列在迁移 045 上有 `default current_date`（本意是给存量数据兜底），
 * 于是每一张新凭证的会计日期都被悄悄记成「今天」，而不是业务发生日。
 *
 * 最坏的地方是它**不报错**，而且 POST 的响应还是对的——
 * 响应返回的是内存里构造的对象，只有再 `GET` 一次才看得出来：
 *
 * ```
 * POST /api/vouchers  → accountingDate: "2026-07-15"   ← 业务发生日，对的
 * GET  /api/vouchers/:id → accountingDate: "2026-08-27" ← 今天，错的
 * ```
 *
 * 后果是按期间统计的一切都错位：利润表、试算平衡、期间锁判定。
 * 一笔 7 月的费用记进 8 月，7 月的报表少一笔、8 月多一笔，两个月都不对。
 *
 * ## 所以这里断言「写进去再读回来」
 *
 * **不看 POST 的响应**——那正是掩盖了这个 bug 的东西。
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
/** 业务发生日刻意选一个**不是今天**的过去日期——等于今天的话这条测试测不出任何东西。 */
const OCCURRED_ON = "2026-07-15";

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

test("凭证会计日期取业务发生日，不是落库当天", async (t) => {
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

  const today = new Date().toISOString().slice(0, 10);
  assert.notEqual(OCCURRED_ON, today, "夹具日期必须不等于今天，否则这条测试永远是绿的");

  // 建一条 7 月的事项
  const { createEvent } = await import("../events/routes.js");
  const eventCapture = capture();
  await createEvent(
    {
      method: "POST",
      url: "/api/events",
      body: {
        type: "expense",
        title: "会计日期夹具",
        occurredOn: OCCURRED_ON,
        description: "验证会计日期取业务发生日",
        amount: "1000"
      },
      auth: { ...auth(), roleCodes: ["role-employee"] }
    } as ApiRequest,
    eventCapture.response
  );
  const created = eventCapture.read<{ id: string }>();
  assert.equal(created.statusCode, 201, "事项应当建成功");
  const eventId = created.body!.id;

  // 按模板建凭证
  const { createVoucherFromTemplate } = await import("./voucher-from-template.js");
  const voucherCapture = capture();
  await createVoucherFromTemplate(
    {
      method: "POST",
      url: "/api/vouchers",
      body: {
        templateKey: "expense",
        amount: "1000",
        businessEventId: eventId,
        summary: "会计日期夹具凭证"
      },
      auth: auth()
    } as ApiRequest,
    voucherCapture.response
  );
  const voucher = voucherCapture.read<{ id: string; accountingDate: string }>();
  assert.equal(voucher.statusCode, 201);
  const voucherId = voucher.body!.id;

  // ── 关键断言：从**库里**读回来 ──────────────────────────────────────────
  //
  // 刻意不断言 POST 的响应。那个响应是内存对象，它一直是对的，
  // 正是它掩盖了这个 bug。
  const stored = await pool.query<{ accounting_date: string | Date }>(
    `select accounting_date from vouchers where id = $1`,
    [voucherId]
  );
  const storedDate = stored.rows[0]!.accounting_date;
  const asIso =
    storedDate instanceof Date ? storedDate.toISOString().slice(0, 10) : String(storedDate).slice(0, 10);

  assert.equal(
    asIso,
    OCCURRED_ON,
    `库里的会计日期应当是业务发生日 ${OCCURRED_ON}，实际是 ${asIso}` +
      (asIso === today ? "——落成了今天，说明 insert 又漏了 accounting_date" : "")
  );

  // 再走一次读接口，确认对外呈现的也是同一个日期。
  const { getVoucherDetail } = await import("./routes.js");
  const detailCapture = capture();
  await getVoucherDetail(
    { method: "GET", url: `/api/vouchers/${voucherId}`, auth: auth() } as ApiRequest,
    detailCapture.response,
    voucherId
  );
  const detail = detailCapture.read<{ accountingDate: string }>();
  assert.equal(detail.body!.accountingDate, OCCURRED_ON, "读接口返回的会计日期也必须是业务发生日");
});
