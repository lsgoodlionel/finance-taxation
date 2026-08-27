/**
 * 不挂经营事项的凭证也要能过账（V16）。
 *
 * ## 背景
 *
 * `voucher_posting_records.business_event_id` 曾是 not null，而**很多凭证天生没有事项**：
 * 折旧、报销付款、备用金打款、银行付款——它们由系统按周期或按单据生成，
 * 不挂在某一条经营事项上。
 *
 * 于是这些凭证一过账就 500，整条费控链路的账**永远进不了总账**：
 * 钱付了、单据批了、凭证生成了，就是过不去。月结第 4 步「计提折旧」
 * 也因此永久卡住——它的判据要求存在已过账的折旧凭证。
 *
 * 六个角色的操作实验里，财务负责人和会计**各自独立**撞上了这一条。
 * 它此前没有任何测试覆盖，因为所有既有的凭证测试都从经营事项出发建凭证——
 * **测试沿着最顺的那条路走，而缺陷在岔路上。**
 *
 * 迁移 098 把该列改成可空。这里钉住修复不回退。
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
const VOUCHER_ID = "vch-no-event-fixture";

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

test("不挂经营事项的凭证（折旧/付款这类）能走完复核与过账", async (t) => {
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

  // 直接造一张 business_event_id 为 null 的凭证——这正是折旧/付款凭证的形状。
  //
  // 科目用 660202 而不是 6602：后者是汇总科目，系统会拒绝直接记账
  // （往汇总科目记会让金额在合计时被算两次）。那条拦截是对的，
  // 第一版夹具写错科目被它挡下来了。
  await pool.query(
    `insert into vouchers (
       id, company_id, business_event_id, mapping_id, voucher_type, summary,
       status, source, accounting_date, approved_at, posted_at, created_at, updated_at
     ) values ($1,$2,null,null,'depreciation','[夹具] 计提折旧','draft','depreciation',
               '2026-08-31'::date, null, null, now(), now())`,
    [VOUCHER_ID, COMPANY_ID]
  );
  await pool.query(
    `insert into voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
     values ($1,$2,'计提折旧','660202','管理费用-折旧',1000,0,0),
            ($3,$2,'计提折旧','1602','累计折旧',0,1000,1)`,
    [`${VOUCHER_ID}-l1`, VOUCHER_ID, `${VOUCHER_ID}-l2`]
  );

  // 复核（财务负责人）→ 过账（会计），职责分离照旧要满足。
  const { approveVoucher, postVoucher } = await import("./routes.js");

  const approveCapture = capture();
  await approveVoucher(
    {
      method: "POST",
      url: `/api/vouchers/${VOUCHER_ID}/approve`,
      body: {},
      auth: auth("role-finance-director", "usr-v4-manager")
    } as ApiRequest,
    approveCapture.response,
    VOUCHER_ID
  );
  assert.equal(approveCapture.read().statusCode, 200, "复核应当成功");

  const postCapture = capture();
  await postVoucher(
    {
      method: "POST",
      url: `/api/vouchers/${VOUCHER_ID}/post`,
      body: { authorizerUserId: "usr-v4-manager" },
      auth: auth("role-accountant", "usr-v4-accountant")
    } as ApiRequest,
    postCapture.response,
    VOUCHER_ID
  );
  const posted = postCapture.read<{ status: string; error?: string; code?: string }>();
  if (posted.statusCode !== 200) {
    console.error("过账失败：", JSON.stringify(posted.body));
  }

  assert.equal(
    posted.statusCode,
    200,
    "没有经营事项的凭证必须能过账——折旧、报销付款、备用金打款都是这个形状；" +
      "过不去意味着整条费控链路的账永远进不了总账"
  );
  assert.equal(posted.body!.status, "posted");

  // 过账记录如实存 null，而不是回填一个不存在的事项。
  const record = await pool.query<{ business_event_id: string | null }>(
    `select business_event_id from voucher_posting_records where voucher_id = $1`,
    [VOUCHER_ID]
  );
  assert.equal(record.rows.length, 1, "应当留下一条过账记录");
  assert.equal(
    record.rows[0]!.business_event_id,
    null,
    "没有事项就如实存 null——回填凭证 id 或造占位事项都是往审计链里塞不存在的东西"
  );

  // 总账里真的有这两条分录。
  const entries = await pool.query<{ n: string }>(
    `select count(*)::text n from ledger_entries where voucher_id = $1`,
    [VOUCHER_ID]
  );
  assert.equal(entries.rows[0]!.n, "2", "过账后分录应当进总账");
});
