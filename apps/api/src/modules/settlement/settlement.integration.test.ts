/**
 * 往来账龄与核销的**路径级**断言（V12-C2）。
 *
 * 账龄的桶边界、方向判定已由 aging.test.ts 钉住。这里测的是只有走通整条路径
 * 才暴露的东西：往来维度有没有真的写进 ledger_entries、核销的六条拒绝在
 * 路径上是否生效、超额核销的触发器是否真的挡得住绕过应用层的写入。
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
const CP_A = "cp-test-a";
const CP_B = "cp-test-b";

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

/**
 * 直接造总账分录：本用例要测的是核销与账龄，凭证过账链路由 vouchers 侧的
 * 用例覆盖，这里不重复走一遍。分录 id 手工指定以便断言。
 */
/** ledger_entries.voucher_id 非空——每笔测试分录挂一张最小的已过账凭证。 */
async function seedVoucher(pool: pg.Pool, voucherId: string, accountingDate: string): Promise<void> {
  await pool.query(
    `insert into vouchers (id, company_id, voucher_type, summary, status, source, accounting_date, period, posted_at)
     values ($1, $2, 'general', $3, 'posted', 'test', $4::date, $5, now())
     on conflict (id) do nothing`,
    [voucherId, COMPANY_ID, `测试凭证 ${voucherId}`, accountingDate, accountingDate.slice(0, 7)]
  );
}

async function seedEntry(
  pool: pg.Pool,
  params: {
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    entryDate: string;
    counterpartyId: string | null;
  }
): Promise<void> {
  const voucherId = `vch-${params.id}`;
  await seedVoucher(pool, voucherId, params.entryDate);
  await pool.query(
    `insert into ledger_entries (
       id, company_id, voucher_id, business_event_id, entry_date, summary,
       account_code, account_name, debit, credit, source, posted_at, counterparty_id
     ) values ($1, $2, $10, null, $3::date, $4, $5, $6, $7::numeric, $8::numeric,
               'voucher_posting', now(), $9)`,
    [
      params.id,
      COMPANY_ID,
      params.entryDate,
      `测试分录 ${params.id}`,
      params.accountCode,
      params.accountName,
      params.debit,
      params.credit,
      params.counterpartyId,
      voucherId
    ]
  );
}

async function getAging(query: string) {
  const { getAgingRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await getAgingRoute(
    { method: "GET", url: `/api/settlement/aging?${query}`, auth: createAuthContext() } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function settle(body: Record<string, unknown>) {
  const { settleRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await settleRoute(
    { method: "POST", url: "/api/settlement/settle", auth: createAuthContext(), body } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

async function getOpenItems(query: string) {
  const { getOpenItemsRoute } = await import("./routes.js");
  const capture = createResponseCapture();
  await getOpenItemsRoute(
    {
      method: "GET",
      url: `/api/settlement/open-items?${query}`,
      auth: createAuthContext()
    } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("往来账龄与核销的完整路径", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await pool.query(
    `insert into counterparties (id, company_id, name, category, credit_days)
     values ($1, $2, '甲客户', 'customer', 60), ($3, $2, '乙客户', 'customer', 0)`,
    [CP_A, COMPANY_ID, CP_B]
  );

  // 甲客户：2026-01-10 赊销 10 万（账龄长、已逾期），2026-06-01 赊销 3 万
  // 乙客户：2026-05-01 赊销 5 万
  // 一笔无往来单位的应收 7000，验证"未指定"分组不被丢掉
  await seedEntry(pool, { id: "le-ar-1", accountCode: "1122", accountName: "应收账款", debit: "100000.00", credit: "0.00", entryDate: "2026-01-10", counterpartyId: CP_A });
  await seedEntry(pool, { id: "le-ar-2", accountCode: "1122", accountName: "应收账款", debit: "30000.00", credit: "0.00", entryDate: "2026-06-01", counterpartyId: CP_A });
  await seedEntry(pool, { id: "le-ar-3", accountCode: "1122", accountName: "应收账款", debit: "50000.00", credit: "0.00", entryDate: "2026-05-01", counterpartyId: CP_B });
  await seedEntry(pool, { id: "le-ar-4", accountCode: "1122", accountName: "应收账款", debit: "7000.00", credit: "0.00", entryDate: "2026-06-10", counterpartyId: null });
  // 甲客户 2026-06-20 收款 4 万（核销方）
  await seedEntry(pool, { id: "le-recv-1", accountCode: "1122", accountName: "应收账款", debit: "0.00", credit: "40000.00", entryDate: "2026-06-20", counterpartyId: CP_A });
  // 应付：丙供应商欠款 2 万（贷方是发生方）
  await seedEntry(pool, { id: "le-ap-1", accountCode: "2202", accountName: "应付账款", debit: "0.00", credit: "20000.00", entryDate: "2026-04-01", counterpartyId: CP_B });

  await t.test("往来维度真的落进了 ledger_entries", async () => {
    const row = await pool.query<{ counterparty_id: string }>(
      `select counterparty_id from ledger_entries where id = 'le-ar-1'`
    );
    assert.equal(row.rows[0]?.counterparty_id, CP_A);
  });

  await t.test("账龄表按账龄分桶，逾期按信用账期另算", async () => {
    const aging = await getAging("direction=receivable&asOf=2026-06-30");
    assert.equal(aging.statusCode, 200);
    // 10万 + 3万 + 5万 + 0.7万 = 18.7 万（收款尚未核销，不冲减任何一笔）
    assert.equal(aging.body?.total, "187000.00");

    const buckets = Object.fromEntries(
      (aging.body?.buckets as { key: string; amount: string }[]).map((b) => [b.key, b.amount])
    );
    assert.equal(buckets["0-30"], "37000.00", "6-01 的 3 万与 6-10 的 0.7 万");
    assert.equal(buckets["31-60"], "50000.00", "5-01 到 6-30 恰好 60 天，落在 31-60 桶");
    assert.equal(buckets["91-180"], "100000.00", "1-10 的 10 万，账龄 171 天");

    // 甲客户信用账期 60 天：1-10 那笔账龄 171 天 → 逾期；6-01 那笔账龄 29 天 → 未逾期
    // 乙客户账期 0 天：全部逾期。无往来单位的按 0 天账期算，也逾期。
    assert.equal(aging.body?.overdue, "157000.00");
  });

  await t.test("无往来单位的笔归入未指定分组，分户合计等于总额", async () => {
    const aging = await getAging("direction=receivable&asOf=2026-06-30");
    const rows = aging.body?.counterparties as { counterpartyId: string | null; total: string }[];
    const sum = rows.reduce((acc, row) => acc + Number(row.total), 0);
    assert.equal(sum.toFixed(2), aging.body?.total);
    assert.ok(rows.some((row) => row.counterpartyId === null), "未指定分组必须出现，不能被丢掉");
  });

  await t.test("应付账龄独立成表，不与应收混算", async () => {
    const aging = await getAging("direction=payable&asOf=2026-06-30");
    assert.equal(aging.body?.total, "20000.00");
  });

  await t.test("跨往来单位核销被拒", async () => {
    const rejected = await settle({
      openEntryId: "le-ar-3", // 乙客户的欠款
      settleEntryId: "le-recv-1", // 甲客户的收款
      settledOn: "2026-06-20"
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "SETTLE_COUNTERPARTY_MISMATCH");
  });

  await t.test("应收与应付互相核销被拒", async () => {
    const rejected = await settle({
      openEntryId: "le-ap-1", // 应付
      settleEntryId: "le-recv-1", // 应收侧的收款
      settledOn: "2026-06-20"
    });
    assert.notEqual(rejected.statusCode, 201);
    assert.ok(
      ["SETTLE_DIRECTION_MISMATCH", "SETTLE_COUNTERPARTY_MISMATCH"].includes(
        String(rejected.body?.code)
      ),
      `应付与应收不能互核，实际返回 ${rejected.body?.code}`
    );
  });

  await t.test("两笔欠款互相核销被拒", async () => {
    const rejected = await settle({
      openEntryId: "le-ar-1",
      settleEntryId: "le-ar-2",
      settledOn: "2026-06-20"
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "SETTLE_SAME_SIDE");
  });

  await t.test("核销额超出欠款余额被拒", async () => {
    const rejected = await settle({
      openEntryId: "le-ar-2", // 3 万
      settleEntryId: "le-recv-1", // 4 万
      amount: "35000.00",
      settledOn: "2026-06-20"
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body?.code, "SETTLE_EXCEEDS_BALANCE");
  });

  await t.test("部分核销：欠款与收款两侧余额同步减少", async () => {
    const ok = await settle({
      openEntryId: "le-ar-2",
      settleEntryId: "le-recv-1",
      amount: "30000.00",
      settledOn: "2026-06-20"
    });
    assert.equal(ok.statusCode, 201, JSON.stringify(ok.body));
    assert.equal(ok.body?.openRemaining, "0.00", "3 万的欠款被全额核销");
    assert.equal(ok.body?.settleRemaining, "10000.00", "4 万的收款还剩 1 万可用");
  });

  await t.test("已结清的笔从账龄表消失", async () => {
    const aging = await getAging("direction=receivable&asOf=2026-06-30");
    assert.equal(aging.body?.total, "157000.00", "18.7 万减去已核销的 3 万");
    const items = aging.body?.items as { entryId: string }[];
    assert.ok(!items.some((item) => item.entryId === "le-ar-2"));
  });

  await t.test("收款剩余额度可继续核销另一笔欠款", async () => {
    const ok = await settle({
      openEntryId: "le-ar-1", // 10 万
      settleEntryId: "le-recv-1", // 还剩 1 万
      settledOn: "2026-06-20"
      // 不传金额 → 按两侧较小者全额核销
    });
    assert.equal(ok.statusCode, 201, JSON.stringify(ok.body));
    assert.equal(ok.body?.amount, "10000.00", "不传金额时按可用余额的较小者核销");
    assert.equal(ok.body?.settleRemaining, "0.00");
  });

  await t.test("收款额度用尽后再核销被拒", async () => {
    // 用同一个往来单位的另一笔欠款，确保撞上的是额度耗尽而不是往来单位不一致
    const rejected = await settle({
      openEntryId: "le-ar-4",
      settleEntryId: "le-recv-1",
      settledOn: "2026-06-20"
    });
    assert.notEqual(rejected.statusCode, 201);
    assert.ok(
      ["SETTLE_AMOUNT_INVALID", "SETTLE_COUNTERPARTY_MISMATCH"].includes(String(rejected.body?.code))
    );
  });

  await t.test("触发器在绕过应用层时仍挡住超额核销", async () => {
    await assert.rejects(
      pool.query(
        `insert into ar_ap_settlements (id, company_id, open_entry_id, settle_entry_id, amount, settled_on)
         values ('stl-bypass', $1, 'le-ar-3', 'le-recv-1', '99999.00', '2026-06-20')`,
        [COMPANY_ID]
      ),
      /超出/,
      "应用层可以被下一个调用方绕过，触发器不行"
    );
  });

  await t.test("待核销明细只列还有余额的笔", async () => {
    const items = await getOpenItems("direction=receivable&asOf=2026-06-30");
    assert.equal(items.statusCode, 200);
    const openIds = (items.body?.openItems as { entryId: string }[]).map((i) => i.entryId);
    assert.ok(!openIds.includes("le-ar-2"), "已结清的不该再出现在配对界面");
    assert.ok(openIds.includes("le-ar-3"));
    const settleIds = (items.body?.settleItems as { entryId: string }[]).map((i) => i.entryId);
    assert.ok(!settleIds.includes("le-recv-1"), "额度用尽的收款也不该再出现");
  });

  await t.test("撤销核销后欠款重新出现在账龄表", async () => {
    const { deleteSettlementRoute } = await import("./routes.js");
    const capture = createResponseCapture();
    await deleteSettlementRoute(
      { method: "DELETE", url: "/api/settlement/settlements/x", auth: createAuthContext() } as ApiRequest,
      capture.response,
      "stl-le-ar-2-le-recv-1"
    );
    assert.equal(capture.readJson().statusCode, 200);

    const aging = await getAging("direction=receivable&asOf=2026-06-30");
    assert.equal(aging.body?.total, "177000.00", "撤销 3 万的核销后欠款回到账龄表");
  });
});

/**
 * 预收账款的核销路径（V12 残留 8 · 迁移 071）。
 *
 * 独立一个顶层 test 是为了拿到干净的库：上面那个块里已经有应付账款的余额，
 * 而预收与应付共用 `direction=payable` 一张账龄表，混在一起断言就说不清
 * 「这 5 万到底是预收还是应付」。
 *
 * 走的是 HTTP handler 而不是纯函数：C2 那次「核销方已用额度恒为 0」的 bug 就是
 * SQL 只 join 了 open_entry_id、纯函数完全测不出来，集成测试才抓到。这次改的是
 * account_type 的归类，同样只有走到 SQL 才知道 `= any($n::text[])` 真的把新类型
 * 带进去了。
 */
test("预收账款能核销——迁移 071 之前它被泛化的 liability_current 挡在门外", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await pool.query(
    `insert into counterparties (id, company_id, name, category, credit_days)
     values ($1, $2, '丁客户', 'customer', 0)`,
    [CP_A, COMPANY_ID]
  );

  // 3-01 收到客户预付货款 5 万：借 银行存款 / 贷 预收账款 —— 贷方形成义务
  await seedEntry(pool, { id: "le-adv-1", accountCode: "2203", accountName: "预收账款", debit: "0.00", credit: "50000.00", entryDate: "2026-03-01", counterpartyId: CP_A });
  // 6-15 发货确认收入 3 万：借 预收账款 / 贷 主营业务收入 —— 借方了结
  await seedEntry(pool, { id: "le-adv-settle", accountCode: "2203", accountName: "预收账款", debit: "30000.00", credit: "0.00", entryDate: "2026-06-15", counterpartyId: CP_A });

  await t.test("预收余额进得了账龄表", async () => {
    const aging = await getAging("direction=payable&asOf=2026-06-30");
    assert.equal(aging.statusCode, 200);
    assert.equal(aging.body?.total, "50000.00", "核销前是全额——发货那笔尚未与它配对");

    const buckets = Object.fromEntries(
      (aging.body?.buckets as { key: string; amount: string }[]).map((b) => [b.key, b.amount])
    );
    assert.equal(buckets["91-180"], "50000.00", "3-01 到 6-30 是 121 天");
  });

  await t.test("发货那笔作为核销方出现在待核销明细里", async () => {
    const items = await getOpenItems("direction=payable&asOf=2026-06-30");
    const settleIds = (items.body?.settleItems as { entryId: string }[]).map((i) => i.entryId);
    assert.ok(
      settleIds.includes("le-adv-settle"),
      "借方的预收账款分录是核销方——方向判反的话它会被当成新的预收义务"
    );
  });

  await t.test("核销后预收余额只剩未发货部分", async () => {
    const done = await settle({
      openEntryId: "le-adv-1",
      settleEntryId: "le-adv-settle",
      amount: "30000.00"
    });
    assert.equal(done.statusCode, 201, JSON.stringify(done.body));

    const aging = await getAging("direction=payable&asOf=2026-06-30");
    assert.equal(aging.body?.total, "20000.00", "5 万预收发了 3 万的货，还欠 2 万");
  });

  await t.test("核销额超出预收余额被拒", async () => {
    await seedEntry(pool, { id: "le-adv-settle-2", accountCode: "2203", accountName: "预收账款", debit: "99000.00", credit: "0.00", entryDate: "2026-06-20", counterpartyId: CP_A });
    const rejected = await settle({
      openEntryId: "le-adv-1",
      settleEntryId: "le-adv-settle-2",
      amount: "99000.00"
    });
    assert.notEqual(rejected.statusCode, 201, "预收只剩 2 万，发 9.9 万的货说明有笔预收没记账");
  });
});

/**
 * 往来单位的**录入侧**（V12-C2 补齐）。
 *
 * C2 做了往来核销与账龄，凭证的 `attachCounterparty` 从业务事项继承这个维度——
 * 但**事项创建时硬编码写 null**，压根没有录入口。种子库实测：28 个事项 0 个有往来
 * 单位，20 条分录 0 条，于是账龄表与核销整条链路都是空的。
 *
 * 上面那些用例是直接往库里塞 counterparty_id 造的数据，测得到核销规则、测不到
 * 「用户怎么让一笔账带上往来单位」。这里补的正是那一段。
 */
test("往来单位从事项录入并传到凭证行", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  t.after(async () => {
    await pool.end();
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  await pool.query(
    `insert into counterparties (id, company_id, name, category, credit_days)
     values ($1, $2, '甲供应商', 'supplier', 30), ($3, $2, '乙供应商', 'supplier', 60)`,
    [CP_A, COMPANY_ID, CP_B]
  );

  async function createEvent(body: Record<string, unknown>) {
    const { createEvent: route } = await import("../events/routes.js");
    const capture = createResponseCapture();
    await route(
      { method: "POST", url: "/api/events", auth: createAuthContext(), body } as ApiRequest,
      capture.response
    );
    return capture.readJson();
  }

  async function createVoucher(body: Record<string, unknown>) {
    const { createVoucherFromTemplate } = await import("../vouchers/routes.js");
    const capture = createResponseCapture();
    await createVoucherFromTemplate(
      { method: "POST", url: "/api/vouchers", auth: createAuthContext(), body } as ApiRequest,
      capture.response
    );
    return capture.readJson();
  }

  let eventId = "";

  await t.test("事项能带上往来单位——此前这一列硬编码成 null", async () => {
    const created = await createEvent({
      type: "expense",
      title: "采购办公用品",
      occurredOn: "2026-06-20",
      amount: "600.00",
      counterpartyId: CP_A
    });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    eventId = String(created.body?.id);

    const row = await pool.query<{ counterparty_id: string | null }>(
      `select counterparty_id from business_events where id = $1`,
      [eventId]
    );
    assert.equal(row.rows[0]?.counterparty_id, CP_A);
  });

  await t.test("凭证从事项继承往来单位，只贴往来科目", async () => {
    const created = await createVoucher({
      templateKey: "expense",
      amount: "600.00",
      businessEventId: eventId
    });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));

    const rows = await pool.query<{ account_code: string; counterparty_id: string | null }>(
      `select account_code, counterparty_id from voucher_lines where voucher_id = $1 order by sort_order`,
      [String(created.body?.id)]
    );
    const payable = rows.rows.find((r) => r.account_code === "2241");
    const expense = rows.rows.find((r) => r.account_code === "660207");
    assert.equal(payable?.counterparty_id, CP_A, "其他应付款是往来科目，要带上");
    assert.equal(expense?.counterparty_id, null, "管理费用不是往来科目，不带");
  });

  await t.test("请求体上的往来单位覆盖事项继承——记账时才知道对方是谁的情形", async () => {
    const created = await createVoucher({
      templateKey: "expense",
      amount: "600.00",
      businessEventId: eventId,
      counterpartyId: CP_B
    });
    assert.equal(created.statusCode, 201);

    const rows = await pool.query<{ counterparty_id: string | null }>(
      `select counterparty_id from voucher_lines
        where voucher_id = $1 and account_code = '2241'`,
      [String(created.body?.id)]
    );
    assert.equal(rows.rows[0]?.counterparty_id, CP_B, "覆盖成乙供应商，而不是事项上的甲");
  });
});
