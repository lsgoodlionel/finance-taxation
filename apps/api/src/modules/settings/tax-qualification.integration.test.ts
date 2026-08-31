/**
 * 税收资格能在公司档案里录入（V17 阶段三批次 A）。
 *
 * ## 为什么这条不能省
 *
 * 判定逻辑做对了，但资格**只能改库设置**的话，实际效果是所有公司都停在
 * 「优惠资格待确认」——比写死 25% 更难用。V17 阶段一就踩过一次同样的坑：
 * 判定链路打通了，界面上没有入口，于是绝大多数业务走兜底路径。
 *
 * ## null 与 0 的区别要一路保住
 *
 * 从业人数 `null` 是「没登记」，要报「资格待确认」；`0` 是「确实没有员工」，
 * 是一个有效的判定输入。表单上的空输入框传上来是空串——
 * **空串必须落成 null，不能落成 0**，否则一家没登记的公司会被当成
 * 0 人 0 资产的小微企业，按 5% 算税。
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

function auth(): AuthContext {
  return {
    companyId: COMPANY_ID,
    userId: "usr-v4-chairman",
    username: "v4_chairman",
    departmentId: "dept-v4-exec",
    departmentName: "总经办",
    roleCodes: ["role-chairman"],
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

type Profile = {
  employeeCount: number | null;
  totalAssetsCents: number | null;
  isRestrictedIndustry: boolean;
  highTechCertificateExpiresOn: string | null;
  urbanConstructionTaxZone: string | null;
};

async function save(body: Record<string, unknown>) {
  const { updateCompanySettings } = await import("./routes.js");
  const c = capture();
  await updateCompanySettings(
    { method: "PUT", url: "/api/settings/company", body, auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<Profile & { error?: string; code?: string }>();
}

async function read() {
  const { getCompanySettings } = await import("./routes.js");
  const c = capture();
  await getCompanySettings(
    { method: "GET", url: "/api/settings/company", auth: auth() } as ApiRequest,
    c.response
  );
  return c.read<Profile>();
}

test("税收资格能录能读，空值保持 null 而不是变成 0", async (t) => {
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

  // ── 初始状态：没登记 ────────────────────────────────────────────────────
  const initial = await read();
  assert.equal(initial.body!.employeeCount, null, "没登记就是 null");
  assert.equal(initial.body!.totalAssetsCents, null);

  // ── 录入 ────────────────────────────────────────────────────────────────
  const saved = await save({
    employeeCount: 50,
    totalAssetsCents: 100_000_000,
    highTechCertificateExpiresOn: "2027-12-31",
    urbanConstructionTaxZone: "city"
  });
  assert.equal(saved.statusCode, 200, `保存应当成功：${saved.body?.error ?? ""}`);

  const after = await read();
  assert.equal(after.body!.employeeCount, 50);
  assert.equal(after.body!.totalAssetsCents, 100_000_000);
  assert.equal(after.body!.highTechCertificateExpiresOn, "2027-12-31");
  assert.equal(after.body!.urbanConstructionTaxZone, "city");

  // ── 清空：落成 null，不是 0 ─────────────────────────────────────────────
  //
  // **这是最容易写错的一处。** 表单上清空输入框传上来是空串，
  // 用 `Number("")` 会得到 0——一家没登记的公司就变成了「0 人 0 资产」，
  // 恰好落在小微阈值内，按 5% 算税。少交的税要补，还有滞纳金。
  const cleared = await save({ employeeCount: "", totalAssetsCents: "" });
  assert.equal(cleared.statusCode, 200);

  const afterClear = await read();
  assert.equal(afterClear.body!.employeeCount, null, "空串要落成 null，不能变成 0");
  assert.equal(afterClear.body!.totalAssetsCents, null);

  // 0 本身是有效值，与「没登记」不同。
  const zeroed = await save({ employeeCount: 0 });
  assert.equal(zeroed.statusCode, 200);
  assert.equal(
    (await read()).body!.employeeCount,
    0,
    "显式填 0 要存成 0——它与「没登记」是两回事"
  );

  // ── 认不出的城建税档位被拒 ──────────────────────────────────────────────
  const bogusZone = await save({ urbanConstructionTaxZone: "火星" });
  assert.equal(bogusZone.statusCode, 400, "档位只有市区/县镇/其他三档");
  assert.equal(bogusZone.body!.code, "URBAN_TAX_ZONE_INVALID");

  // ── 负数人数被拒 ────────────────────────────────────────────────────────
  const negative = await save({ employeeCount: -1 });
  assert.equal(negative.statusCode, 400, "从业人数不能是负数");
});
