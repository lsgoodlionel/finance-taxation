/**
 * 纳税人档案沿革（V16 角色实验发现的阻断缺陷）。
 *
 * ## 缺陷：写入端与读取端互相矛盾
 *
 * 读取端 `resolveActiveTaxpayerProfile` 按「所有 active 里取生效日 ≤ 查询日的
 * 最近一条」——它本来就是按**多档沿革**设计的。
 *
 * 写入端却在每次新增时无条件把**所有** active 改成 inactive。
 *
 * 税务专员实测到的后果：录一条 **2030-01-01 生效**的小规模登记，
 * 当场把 2026 年那条也改成 inactive，于是
 * `GET /api/tax/rules?occurredOn=2026-05-01` 立刻变成
 * 「Active taxpayer profile not found」——**整个税务模块当期瘫痪**，
 * 而用户只是录了一条未来生效的登记。
 *
 * ## 为什么这条特别重要
 *
 * 纳税人身份是**会变的**（小规模转一般纳税人）。重算 2024 年的账要按
 * 当时的身份，不是按今天的——和税率沿革（17%→16%→13%）是同一个道理。
 * 沿革保存不下来，历史属期就永远算不对。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { TaxpayerProfile } from "@finance-taxation/domain-model";
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

async function createProfile(body: Record<string, unknown>) {
  const { createTaxpayerProfile } = await import("./taxpayer-profile.routes.js");
  const c = capture();
  await createTaxpayerProfile(
    { method: "POST", url: "/api/tax/taxpayer-profiles", body, auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<{ error?: string; code?: string; id?: string }>();
}

test("纳税人身份沿革：多档共存，各管一段时间", async (t) => {
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

  // ── 第一档：2024 年起小规模，到 2025 年底 ──────────────────────────────
  const first = await createProfile({
    taxpayerType: "small_scale",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2025-12-31",
    notes: "小规模纳税人"
  });
  assert.equal(first.statusCode, 201, "第一档应当建成功");

  // ── 第二档：2026 年起转一般纳税人，无上界 ──────────────────────────────
  const second = await createProfile({
    taxpayerType: "general_vat",
    effectiveFrom: "2026-01-01",
    notes: "转为一般纳税人"
  });
  assert.equal(second.statusCode, 201, "接续的一档应当能建——沿革不该被一刀切覆盖");

  // 两档都还 active。这是整件事的核心：**历史保存下来了**。
  const actives = await pool.query<{ n: string }>(
    `select count(*)::text n from taxpayer_profiles where company_id = $1 and status = 'active'`,
    [COMPANY_ID]
  );
  assert.equal(actives.rows[0]!.n, "2", "两档应当同时有效，各管一段时间");

  // ── 按业务发生日取到正确的那一档 ────────────────────────────────────────
  const { listCompanyTaxpayerProfiles } = await import("./routes.js");
  const { resolveActiveTaxpayerProfile } = await import("./profile.js");
  const profiles: TaxpayerProfile[] = await listCompanyTaxpayerProfiles(COMPANY_ID);

  assert.equal(
    resolveActiveTaxpayerProfile(profiles, "2024-06-15")?.taxpayerType,
    "small_scale",
    "2024 年的业务要按当时的小规模身份算"
  );
  assert.equal(
    resolveActiveTaxpayerProfile(profiles, "2025-12-31")?.taxpayerType,
    "small_scale",
    "失效日是**含**当天"
  );
  assert.equal(
    resolveActiveTaxpayerProfile(profiles, "2026-01-01")?.taxpayerType,
    "general_vat",
    "2026 年起按一般纳税人"
  );

  // ── 未来生效的登记不能瘫痪当期 ──────────────────────────────────────────
  //
  // **这是税务专员实测到的那个场景**：录一条 2030 年的登记，
  // 此前会把 2026 年那条也改成 inactive，当期口径当场消失。
  const future = await createProfile({
    taxpayerType: "small_scale",
    effectiveFrom: "2030-01-01",
    notes: "未来的登记"
  });
  // 2026 那档没有上界，2030 落在它的区间里 → 重叠，应当被拒。
  assert.equal(future.statusCode, 409, "与现有开放区间重叠的档案应当被拒");
  assert.equal(future.body!.code, "TAXPAYER_PROFILE_OVERLAPS");
  assert.match(
    future.body!.error!,
    /先给上一档填上失效日/,
    "错误要说清怎么办——用户是来录登记的，不是来解谜的"
  );

  // 当期口径**没有**被这次失败的操作影响。
  const afterProfiles: TaxpayerProfile[] = await listCompanyTaxpayerProfiles(COMPANY_ID);
  assert.equal(
    resolveActiveTaxpayerProfile(afterProfiles, "2026-05-01")?.taxpayerType,
    "general_vat",
    "一次被拒的新增不该改变当期的纳税人身份——此前它会让整个税务模块瘫痪"
  );

  // ── 先封口再接续，就能录未来的档 ────────────────────────────────────────
  await pool.query(
    `update taxpayer_profiles set effective_to = '2029-12-31'::date
      where company_id = $1 and effective_from = '2026-01-01'`,
    [COMPANY_ID]
  );
  const afterClose = await createProfile({
    taxpayerType: "small_scale",
    effectiveFrom: "2030-01-01",
    notes: "封口后接续"
  });
  assert.equal(afterClose.statusCode, 201, "上一档封口之后，未来的档应当能建");

  const finalProfiles: TaxpayerProfile[] = await listCompanyTaxpayerProfiles(COMPANY_ID);
  assert.equal(
    resolveActiveTaxpayerProfile(finalProfiles, "2026-05-01")?.taxpayerType,
    "general_vat",
    "当期仍然是一般纳税人"
  );
  assert.equal(
    resolveActiveTaxpayerProfile(finalProfiles, "2030-06-01")?.taxpayerType,
    "small_scale",
    "2030 年起按新登记的身份"
  );
});
