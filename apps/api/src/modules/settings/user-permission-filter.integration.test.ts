/**
 * 按权限过滤公司成员（V16）。
 *
 * ## 为什么加这个过滤
 *
 * 凭证过账要选终审人，而终审人必须持有 `ledger.post`。
 * 此前前端的 `postVoucher()` 写死发空 body，前台**一张凭证都过不了账**——
 * 每次 400 `WORKFLOW_AUTHORIZATION_REQUIRED`，还以未翻译的英文弹出来。
 *
 * 补选择器时有两条路：前端按 roleId 自己判断，或服务端过滤。
 * 选服务端，是因为「哪个角色有哪项权限」的事实来源是 `middleware/auth.ts`
 * 的权限表——前端复制一份，两份迟早漂移，而漂移的方向通常是
 * **把不该出现的人列出来**（比如让没有记账权的出纳去当过账终审人）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

const COMPANY_ID = "cmp-v4-tech";

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

interface MemberList {
  items: { id: string; username: string; displayName: string; roleIds: string[] }[];
  total: number;
}

async function listUsers(query: string) {
  const { getUserList } = await import("./routes.js");
  const c = capture();
  await getUserList(
    { method: "GET", url: `/api/settings/users${query}`, auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<MemberList>();
}

test("成员列表可按权限过滤，且不认识的权限键返回空而不是全部", async (t) => {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);

  t.after(async () => {
    const { closePool } = await import("../../db/client.js");
    await closePool();
  });

  // ── 不带过滤：全部在职成员 ──────────────────────────────────────────────
  const all = await listUsers("");
  assert.equal(all.statusCode, 200);
  assert.ok(all.body!.total > 0, "公司应当有成员");

  // ── 按 ledger.post 过滤：只剩有记账权的人 ────────────────────────────────
  const posters = await listUsers("?permission=ledger.post");
  assert.equal(posters.statusCode, 200);
  assert.ok(posters.body!.total > 0, "应当有人持有记账权限");
  assert.ok(
    posters.body!.total < all.body!.total,
    "过滤后必须比全量少——否则这个过滤等于没做"
  );

  const posterUsernames = posters.body!.items.map((m) => m.username);
  assert.ok(posterUsernames.includes("v4_accountant"), "会计持有 ledger.post");
  assert.ok(posterUsernames.includes("v4_manager"), "财务负责人持有 ledger.post");

  // **出纳没有记账权**——auth.ts 的注释写着「管银行账户、导流水、做对账，
  // 但不含记账权 ledger.post」。把他列进终审人候选，用户选中后只会被服务端拒绝。
  assert.ok(
    !posterUsernames.includes("v4_cashier"),
    "出纳没有 ledger.post，不该出现在终审人候选里"
  );
  assert.ok(!posterUsernames.includes("v4_employee"), "普通员工同样不该出现");

  // ── 不认识的权限键：返回空，而不是把所有人放出来 ──────────────────────
  //
  // 拼错权限键时全量返回，调用方会以为「这些人都有这项权限」——
  // 那比列不出人危险得多。
  const bogus = await listUsers("?permission=ledger.psot");
  assert.equal(bogus.statusCode, 200);
  assert.equal(bogus.body!.total, 0, "权限键不认识时必须返回空");

  // ── 另一个权限键，确认过滤真的按键走而不是写死一份名单 ────────────────
  const settingsManagers = await listUsers("?permission=settings.manage");
  assert.ok(settingsManagers.body!.total > 0, "应当有人能管系统设置");
  assert.notDeepEqual(
    settingsManagers.body!.items.map((m) => m.username).sort(),
    posterUsernames.slice().sort(),
    "不同权限键应当得到不同的人群，否则说明过滤没真的按键生效"
  );
});
