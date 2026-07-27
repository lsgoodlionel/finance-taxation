/**
 * K5 接线回归：业务事件发生时，确实调用了通知派发层，且深链正确。
 *
 * 用注入的 spy dispatcher 替换进程级默认派发器 —— 不发任何网络请求、不依赖任何
 * 外部凭证。同时验证「通知失败绝不影响业务主流程」：故意让派发器抛错，业务响应仍需成功。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import type { ServerResponse } from "node:http";
import type { ApiRequest, AuthContext } from "../../types.js";
// 仅类型导入：类型在编译期被抹掉，不会在 DATABASE_URL 设好之前把 db/client 拉起来。
import type {
  NotificationDelivery,
  NotificationDispatcher,
  NotificationRequest
} from "./dispatch.js";
import type { DeepLinkEvent } from "./deep-link.js";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

// config/env.ts 在模块加载时快照 process.env，因此必须先赋值、再动态 import 任何
// 会传递性引入 db/client 的模块（dispatch.ts 现在会按公司查 integration_configs）。
process.env.DATABASE_URL = databaseUrl;

async function setDispatcher(dispatcher: NotificationDispatcher | null): Promise<void> {
  const { setNotificationDispatcher } = await import("./dispatch.js");
  setNotificationDispatcher(dispatcher);
}

async function deepLink(event: DeepLinkEvent): Promise<string> {
  const { buildDeepLink } = await import("./deep-link.js");
  return buildDeepLink(event, { APP_BASE_URL: "https://ft.example.com" });
}

const COMPANY_ID = "cmp-v4-tech";
const BUSINESS_EVENT_ID = "PUR-STD-001";
/** 验收夹具中确定会产出 high 风险的事项（规则 duplicate_reimbursement：疑似重复报销）。 */
const HIGH_RISK_EVENT_ID = "PUR-DUP-001";

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
    writeHead(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return response;
    },
    end(chunk?: string) {
      if (chunk) {
        body += chunk;
      }
      return response;
    }
  } as unknown as ServerResponse;
  return {
    response,
    readJson<T>() {
      return { statusCode, body: body ? (JSON.parse(body) as T) : null };
    }
  };
}

interface SpyDispatcher extends NotificationDispatcher {
  readonly captured: NotificationRequest[];
}

/** 记录所有派发请求的假派发器；`throwOnDispatch` 用于验证业务不被通知拖垮。 */
function createSpyDispatcher(options: { throwOnDispatch?: boolean } = {}): SpyDispatcher {
  const captured: NotificationRequest[] = [];
  return {
    captured,
    describeChannel: async () => ({ provider: "spy", enabled: true, disabledReason: null }),
    dispatch(request: NotificationRequest): void {
      captured.push(request);
      if (options.throwOnDispatch) {
        throw new Error("派发层内部故障（用于验证业务不受影响）");
      }
    },
    async deliver(request: NotificationRequest): Promise<NotificationDelivery> {
      captured.push(request);
      return {
        at: new Date().toISOString(),
        companyId: request.companyId,
        kind: request.kind,
        provider: "spy",
        status: "sent",
        link: null,
        messageId: "spy-1",
        error: null
      };
    },
    recentDeliveries: () => [],
    drain: async () => undefined
  };
}

async function prepareDatabase(): Promise<void> {
  const { resetTestDatabase } = await import("../../../../../tools/v4/reset-test-db.js");
  const { seedAcceptanceData } = await import("../../../../../tools/v4/seed-acceptance-data.js");
  await resetTestDatabase(databaseUrl);
  await seedAcceptanceData(databaseUrl);
}

async function insertApprovableVoucher(pool: pg.Pool, voucherId: string): Promise<void> {
  await pool.query(
    `insert into event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary, source)
     values ($1, $2, $3, 'payment', 'approved', '通知接线夹具草稿', 'analysis')`,
    [`${voucherId}-draft`, COMPANY_ID, BUSINESS_EVENT_ID]
  );
  await pool.query(
    `insert into vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source)
     values ($1, $2, $3, $4, 'payment', '采购办公用品', 'draft', 'analysis')`,
    [voucherId, COMPANY_ID, BUSINESS_EVENT_ID, `${voucherId}-draft`]
  );
}

test("渠道按公司从 integration_configs 解析：各公司只用自己的凭证与接收人", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    // 两家公司各自配置飞书；第三家（cmp-v4-service）不配。
    await pool.query(
      `insert into integration_configs
         (id, company_id, config_type, provider, api_key, api_secret, app_id, extra_config, enabled)
       values ('ic-n-1', $1, 'notification', 'feishu', 'ou_company_one', 'secret-1', 'cli_one', '{}'::jsonb, true),
              ('ic-n-2', $2, 'notification', 'feishu', 'ou_company_two', 'secret-2', 'cli_two', '{}'::jsonb, true)`,
      [COMPANY_ID, "cmp-v4-group"]
    );

    const { loadCompanyChannel, clearCompanyChannelCache } = await import("./company-channel.js");
    clearCompanyChannelCache();

    const one = await loadCompanyChannel(COMPANY_ID, {});
    const two = await loadCompanyChannel("cmp-v4-group", {});
    const none = await loadCompanyChannel("cmp-v4-service", {});

    assert.equal(one.enabled, true);
    assert.equal(one.provider.name, "feishu");
    assert.equal(two.enabled, true);
    assert.notEqual(one.provider, two.provider, "两家公司必须拿到各自独立的 provider 实例");
    assert.equal(none.enabled, false, "未配置的公司不得借用别家凭证");
    assert.match(none.reason ?? "", /未配置通知渠道/);

    // env 里即便配了飞书，未指名公司也不得对任何公司生效（防跨租户误发）
    clearCompanyChannelCache();
    const withEnv = await loadCompanyChannel("cmp-v4-service", {
      NOTIFY_PROVIDER: "feishu",
      FEISHU_APP_ID: "env-app",
      FEISHU_APP_SECRET: "env-secret",
      FEISHU_DEFAULT_RECEIVE_ID: "ou_operator"
    });
    assert.equal(withEnv.enabled, false, "未指名公司时 env 凭证不得生效");

    // 只有被显式指名的公司才用 env 兜底（自托管单公司部署）
    clearCompanyChannelCache();
    const named = await loadCompanyChannel("cmp-v4-service", {
      NOTIFY_PROVIDER: "feishu",
      FEISHU_APP_ID: "env-app",
      FEISHU_APP_SECRET: "env-secret",
      FEISHU_DEFAULT_RECEIVE_ID: "ou_operator",
      NOTIFY_ENV_FALLBACK_COMPANY_ID: "cmp-v4-service"
    });
    assert.equal(named.enabled, true);
    clearCompanyChannelCache();
  } finally {
    const { closePool } = await import("../../db/client.js");
    await closePool();
    await pool.end();
  }
});

test("approveVoucher 送审时派发 approval_request，深链落到真实存在的前端路由", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const spy = createSpyDispatcher();
  await setDispatcher(spy);

  try {
    await insertApprovableVoucher(pool, "vch-notify-1");
    const { approveVoucher } = await import("../vouchers/routes.js");
    const capture = createResponseCapture();

    await approveVoucher(
      { method: "POST", url: "/api/vouchers/vch-notify-1/approve", auth: createAuthContext() } as ApiRequest,
      capture.response,
      "vch-notify-1"
    );

    assert.equal(capture.readJson().statusCode, 200);
    assert.equal(spy.captured.length, 1, "送审必须触发一条通知");
    const request = spy.captured[0]!;
    assert.equal(request.kind, "approval_request");
    assert.equal(request.companyId, COMPANY_ID);
    assert.match(request.body, /采购办公用品/);
    // 该凭证挂在业务事项上 → 深链走 /events?event=，这是前端确实会读的参数
    assert.equal(
      await deepLink(request.deepLink!),
      `https://ft.example.com/events?event=${BUSINESS_EVENT_ID}`
    );
  } finally {
    await setDispatcher(null);
    const { closePool } = await import("../../db/client.js");
    await closePool();
    await pool.end();
  }
});

test("派发层抛错时 approveVoucher 仍然成功（通知绝不阻塞业务主流程）", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const spy = createSpyDispatcher({ throwOnDispatch: true });
  await setDispatcher(spy);

  try {
    await insertApprovableVoucher(pool, "vch-notify-2");
    const { approveVoucher } = await import("../vouchers/routes.js");
    const capture = createResponseCapture();

    await approveVoucher(
      { method: "POST", url: "/api/vouchers/vch-notify-2/approve", auth: createAuthContext() } as ApiRequest,
      capture.response,
      "vch-notify-2"
    );

    const result = capture.readJson<{ status: string }>();
    assert.equal(result.statusCode, 200, "通知失败不得改变业务响应");
    assert.equal(result.body?.status, "review_required", "业务写入必须已生效");
    assert.equal(spy.captured.length, 1);
  } finally {
    await setDispatcher(null);
    const { closePool } = await import("../../db/client.js");
    await closePool();
    await pool.end();
  }
});

test("runEventRiskCheck 首次高风险才派发，重复扫描不再重推（去噪）", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const spy = createSpyDispatcher();
  await setDispatcher(spy);

  try {
    const { runEventRiskCheck } = await import("../risk/routes.js");
    const request = {
      method: "POST",
      url: `/api/events/${HIGH_RISK_EVENT_ID}/risk-check`,
      auth: createAuthContext()
    } as ApiRequest;

    const first = createResponseCapture();
    await runEventRiskCheck(request, first.response, HIGH_RISK_EVENT_ID);
    const firstResult = first.readJson<{ items: Array<{ severity: string }> }>();
    assert.equal(firstResult.statusCode, 200);
    // 夹具前提：该事项确实产出高风险，否则本用例会空转通过
    assert.ok(
      (firstResult.body?.items ?? []).some((item) => item.severity === "high"),
      `${HIGH_RISK_EVENT_ID} 夹具应产出 high 风险`
    );
    assert.equal(spy.captured.length, 1, "首次出现高风险必须推送一条");
    assert.equal(spy.captured[0]!.kind, "risk_alert");
    assert.equal(
      await deepLink(spy.captured[0]!.deepLink!),
      `https://ft.example.com/risk?finding=duplicate_reimbursement-${HIGH_RISK_EVENT_ID}&event=${HIGH_RISK_EVENT_ID}`
    );

    const second = createResponseCapture();
    await runEventRiskCheck(request, second.response, HIGH_RISK_EVENT_ID);
    assert.equal(second.readJson().statusCode, 200);
    assert.equal(spy.captured.length, 1, "同一批高风险重复扫描不得反复推送");
  } finally {
    await setDispatcher(null);
    const { closePool } = await import("../../db/client.js");
    await closePool();
    await pool.end();
  }
});

test("generateCloseDrafts 生成草稿后按批次汇总派发一条 approval_request", async () => {
  await prepareDatabase();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const spy = createSpyDispatcher();
  await setDispatcher(spy);

  try {
    const { generateCloseDrafts } = await import("../ai-agents/close/close-drafts.routes.js");
    const period = await pool.query<{ period: string }>(
      `select to_char(occurred_on, 'YYYY-MM') as period from business_events
        where company_id = $1 order by occurred_on desc limit 1`,
      [COMPANY_ID]
    );
    const capture = createResponseCapture();

    await generateCloseDrafts(
      {
        method: "POST",
        url: "/api/close/drafts/generate",
        auth: createAuthContext(),
        body: { period: period.rows[0]?.period ?? "2026-05" }
      } as ApiRequest,
      capture.response
    );

    const result = capture.readJson<{ generated: number }>();
    assert.equal(result.statusCode, 200);
    const generated = result.body?.generated ?? 0;

    if (generated > 0) {
      assert.equal(spy.captured.length, 1, "多张草稿只汇总推一条，不逐条推");
      assert.equal(spy.captured[0]!.kind, "approval_request");
      assert.deepEqual(spy.captured[0]!.deepLink, { type: "draft_queue" });
    } else {
      assert.equal(spy.captured.length, 0, "未生成草稿时不得推送");
    }
  } finally {
    await setDispatcher(null);
    const { closePool } = await import("../../db/client.js");
    await closePool();
    await pool.end();
  }
});
