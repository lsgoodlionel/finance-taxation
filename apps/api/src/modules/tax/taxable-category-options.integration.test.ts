/**
 * 应税行为类别的可选项接口（V17 阶段二）。
 *
 * ## 为什么需要这个接口
 *
 * 阶段一把判定链路打通了，但类别**只能通过 API 或直接改库设置**——
 * 界面上没有选择入口。于是绝大多数业务走的是「公司默认类别」这条兜底路径，
 * 混合业务的公司（既卖货又做服务）根本没法逐笔标注。
 *
 * 要在界面上选，前端就得知道有哪些类别可选。这份清单**不能在前端写死**：
 * 类别与税率的对应关系是政策，政策改了两处就会漂移，
 * 而漂移的表现是用户按一个界面上写着 9% 实际按 13% 算的类别去申报。
 *
 * ## 顺带解决预填
 *
 * 接口同时返回公司主营类别，界面按它预填——大多数事项就是主营业务，
 * 让用户每笔都重选一遍是没有意义的负担。
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

type CategoryOptions = {
  companyDefault: string | null;
  taxpayerType: string | null;
  options: { value: string; label: string; rateCode: string; rateHint: string }[];
};

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

async function readOptions() {
  const { listTaxableCategoryOptions } = await import("./taxable-category.routes.js");
  const c = capture();
  await listTaxableCategoryOptions(
    { method: "GET", url: "/api/tax/taxable-categories", auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<CategoryOptions>();
}

test("类别可选项接口：清单来自服务端，公司默认值用来预填", async (t) => {
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

  const res = await readOptions();
  assert.equal(res.statusCode, 200);
  const { options, companyDefault } = res.body!;

  // ── 清单齐全，且每一项都说清税率 ────────────────────────────────────────
  assert.equal(options.length, 17, "17 个类别一个都不能少——少一个就有业务标不了");

  const service = options.find((o) => o.value === "modern_service");
  assert.ok(service, "现代服务必须在清单里");
  assert.equal(service!.label, "现代服务", "给用户看的是中文");
  assert.equal(service!.rateCode, "vat_service");
  assert.match(
    service!.rateHint,
    /6%/,
    "选项上要标出税率——用户是按「这笔算几个点」来判断选哪个的，不是按枚举名"
  );

  assert.match(options.find((o) => o.value === "goods")!.rateHint, /13%/);
  assert.match(options.find((o) => o.value === "construction")!.rateHint, /9%/);

  // ── 公司主营类别，界面按它预填 ──────────────────────────────────────────
  //
  // 种子里 cmp-v4-tech 配的是 goods（卖货）。
  assert.equal(companyDefault, "goods", "预填值取公司主营类别");

  // ── 公司没配主营类别时返回 null，不编一个 ────────────────────────────────
  await pool.query(`update companies set default_taxable_category = null where id = $1`, [
    COMPANY_ID
  ]);
  const bare = await readOptions();
  assert.equal(
    bare.body!.companyDefault,
    null,
    "没配就是没配——前端据此让用户必须自己选，而不是替他选一个"
  );
  assert.equal(bare.body!.options.length, 17, "清单与公司配置无关");
});

test("提示里的税率跟着纳税人身份走，不是一律显示一般计税档位", async (t) => {
  // **小规模纳税人不管卖什么都按征收率。** 给他看「销售货物 13%」
  // 与实际计算对不上——而用户会照着界面上的数字去核对申报表。
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

  // 没登记身份时按一般计税档位显示，并如实说「身份未知」。
  const before = await readOptions();
  assert.equal(before.body!.taxpayerType, null, "没登记就说没登记，不替用户假定一个身份");
  assert.match(before.body!.options.find((o) => o.value === "goods")!.rateHint, /13%/);

  // 登记为小规模之后，所有类别都走征收率。
  await pool.query(
    `insert into taxpayer_profiles (id, company_id, taxpayer_type, effective_from, status, created_at, updated_at)
     values ('tp-small-fixture',$1,'small_scale','2020-01-01'::date,'active', now(), now())`,
    [COMPANY_ID]
  );
  const small = await readOptions();
  assert.equal(small.body!.taxpayerType, "small_scale");

  const goodsHint = small.body!.options.find((o) => o.value === "goods")!.rateHint;
  assert.equal(
    small.body!.options.find((o) => o.value === "goods")!.rateCode,
    "vat_small",
    "小规模不管卖什么都走自己那档"
  );
  assert.equal(
    small.body!.options.find((o) => o.value === "modern_service")!.rateHint,
    goodsHint,
    "小规模看到的各类别税率应当一致——业务性质不影响征收率"
  );
  assert.doesNotMatch(
    goodsHint,
    /13%/,
    "小规模看到 13% 就是错的——他实际按征收率算，照界面核对申报表会对不上"
  );
});
