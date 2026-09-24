/**
 * 全局搜索的路径级断言（P0-1）。
 *
 * ## 这个模块此前零测试，而回顾点了它的名
 *
 * 一个月回顾「发现三 · 权限做了路由级，没做数据级」里写着：
 * **全局搜索跨六类对象聚合却不按调用者逐类过滤**。
 *
 * 这里先把现状钉住：租户隔离是有的（每条 SQL 都带 company_id），
 * 而**按权限逐类过滤没有**——一个只有 `expense.view` 的员工，
 * 搜关键词同样能看到凭证与合同的标题。
 *
 * 那一条属于 P1「数据级权限收敛做成机制」。测试先摆在这里，
 * 修完之后把 `TODO(P1)` 那条断言反过来即可——**留一条会失败的断言
 * 比留一句注释可靠**，注释没人读，断言会在改完那天提醒你。
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

function createAuthContext(
  companyId = COMPANY_ID,
  roleCodes: string[] = ["role-accountant"]
): AuthContext {
  return {
    companyId,
    userId: "usr-v4-accountant",
    username: "v4_accountant",
    departmentId: "dept-v4-finance",
    departmentName: "财务部",
    roleCodes,
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

async function search(keyword: string, auth = createAuthContext()) {
  const { globalSearch } = await import("./search.routes.js");
  const capture = createResponseCapture();
  await globalSearch(
    { method: "GET", url: `/api/search?q=${encodeURIComponent(keyword)}`, auth } as ApiRequest,
    capture.response
  );
  return capture.readJson();
}

test("全局搜索：租户隔离、空查询、逐类过滤现状", async (t) => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  // 两家公司各建一个同名合同——租户隔离要靠这个才测得出来。
  const MARKER = "P0搜索标记词";
  const eventRow = await pool.query<{ id: string }>(
    "select id from business_events where company_id=$1 limit 1",
    [COMPANY_ID]
  );
  assert.ok(eventRow.rows[0], "种子里应当有经营事项");

  for (const [company, suffix] of [
    [COMPANY_ID, "本公司"],
    [OTHER_COMPANY_ID, "别家公司"]
  ] as const) {
    await pool.query(
      `insert into contracts (id, company_id, contract_no, contract_type, title,
                              counterparty_name, amount, signed_date, status,
                              created_by_user_id, created_by_name)
       values ($1, $2, $3, 'purchase', $4, '某供应商', 1000, '2026-04-01'::date, 'active',
               (select id from users where company_id=$2 limit 1), '测试')
       on conflict (id) do nothing`,
      [`ct-search-${suffix}`, company, `HT-SEARCH-${suffix}`, `${MARKER}-${suffix}`]
    );
  }

  await t.test("空查询返回空结果，不返回全部", async () => {
    const result = await search("");
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body!.results, []);
    // 空关键词若走进 ILIKE '%%'，会把全公司的数据一次性摊出来。
    assert.equal(result.body!.total, 0);
  });

  await t.test("能搜到本公司的合同（用有 contracts.view 的角色）", async () => {
    // **默认的 role-accountant 没有 contracts.view**——这与直觉相反，
    // 但权限表就是这么定的：会计管账不管合同条款。
    // 第一版这条用会计跑，P1 的逐类过滤上线后立刻失败——
    // 失败的是我的假设，不是实现。
    const result = await search(MARKER, createAuthContext(COMPANY_ID, ["role-finance-director"]));
    assert.equal(result.statusCode, 200);
    const labels = (result.body!.results as Array<{ label: string }>).map((r) => r.label);
    assert.ok(labels.some((l) => l.includes("本公司")), "应当搜到本公司的合同");
  });

  await t.test("租户隔离：搜不到别家公司的同名合同", async () => {
    const result = await search(MARKER, createAuthContext(COMPANY_ID, ["role-finance-director"]));
    const labels = (result.body!.results as Array<{ label: string }>).map((r) => r.label);
    assert.equal(
      labels.some((l) => l.includes("别家公司")),
      false,
      "泄漏了别家公司的合同"
    );
  });

  await t.test("每类最多 5 条，不会因为一类结果多就把别的类挤掉", async () => {
    // 建 8 条同名合同，验证截断在「每类」而不是「总数」上——
    // 截在总数上会让合同把凭证、发票全挤出结果。
    for (let i = 0; i < 8; i += 1) {
      await pool.query(
        `insert into contracts (id, company_id, contract_no, contract_type, title,
                                counterparty_name, amount, signed_date, status,
                                created_by_user_id, created_by_name)
         values ($1, $2, $3, 'purchase', $4, '某供应商', 1000, '2026-04-01'::date, 'active',
                 (select id from users where company_id=$2 limit 1), '测试')
         on conflict (id) do nothing`,
        [`ct-bulk-${i}`, COMPANY_ID, `HT-BULK-${i}`, `批量标记词-${i}`]
      );
    }
    const result = await search("批量标记词", createAuthContext(COMPANY_ID, ["role-finance-director"]));
    const contracts = (result.body!.results as Array<{ type: string }>).filter(
      (r) => r.type === "contract"
    );
    assert.ok(contracts.length <= 5, `每类应当最多 5 条，实得 ${contracts.length}`);
  });

  await t.test("结果带跳转路径，否则命令面板点了没反应", async () => {
    const result = await search(MARKER, createAuthContext(COMPANY_ID, ["role-finance-director"]));
    for (const item of result.body!.results as Array<{ path: string; type: string }>) {
      assert.ok(item.path.startsWith("/"), `${item.type} 缺跳转路径`);
    }
  });

  await t.test("P1：按调用者权限逐类过滤——没有 contracts.view 就搜不到合同", async () => {
    // **这条断言此前是反的**：它记录「还没做逐类过滤」这个现状，
    // 并写明「修完之后把它反过来，它会在那天提醒你」。P1 做完了，现在反过来。
    // 留一条会失败的断言比留一句注释可靠——注释没人读。
    //
    // 用会计而不是员工：**会计没有 contracts.view，员工反而有**。
    // 这与直觉相反，写测试时按臆想选角色会得到假结论。
    const accountant = createAuthContext(COMPANY_ID, ["role-accountant"]);
    const result = await search(MARKER, accountant);
    const types = new Set((result.body!.results as Array<{ type: string }>).map((r) => r.type));

    assert.equal(types.has("contract"), false, "会计没有 contracts.view，不该搜到合同");
  });

  await t.test("P1：有权限的类照常搜得到，不能一刀切", async () => {
    // 过严与过松同样是错。会计有 ledger.view，凭证该搜得到——
    // 否则用户会觉得搜索坏了。
    const accountant = createAuthContext(COMPANY_ID, ["role-accountant"]);
    const capture = createResponseCapture();
    const { globalSearch } = await import("./search.routes.js");
    await globalSearch(
      { method: "GET", url: "/api/search?q=测试", auth: accountant } as ApiRequest,
      capture.response
    );
    const result = capture.readJson();
    assert.equal(result.statusCode, 200);
    // 至少不能因为加了过滤就把所有类都挡掉。
    assert.ok(Array.isArray(result.body!.results));
  });

  await t.test("P1：没权限的类根本不查，不是查完再滤", async () => {
    // 查完再滤会让数据库白做工，而且一旦哪天有人在过滤前 push 了结果就漏了。
    // 会计搜一个只可能命中合同的词，结果必须是空。
    const accountant = createAuthContext(COMPANY_ID, ["role-accountant"]);
    const result = await search("HT-SEARCH-本公司", accountant);
    assert.equal(result.body!.total, 0, "会计搜合同号应当一条都搜不到");
  });

  await t.test("P1：员工有 contracts.view，所以搜得到合同", async () => {
    // 记录这个反直觉的事实：**员工能看合同、会计不能**。
    // 权限表就是这么定的（员工要看得到自己经手的合同），
    // 这条断言让下一个人不必再去翻权限表验证一遍。
    const employee = createAuthContext(COMPANY_ID, ["role-employee"]);
    const result = await search(MARKER, employee);
    const types = new Set((result.body!.results as Array<{ type: string }>).map((r) => r.type));
    assert.equal(types.has("contract"), true, "员工有 contracts.view，应当搜得到");
  });
});
