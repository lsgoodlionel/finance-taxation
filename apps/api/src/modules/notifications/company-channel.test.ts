import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveChannelFromConfig,
  resolveEnvFallbackChannel,
  type CompanyNotificationConfigRow
} from "./company-channel.js";
import { MockNotificationProvider } from "./mock-provider.js";

const feishuRow: CompanyNotificationConfigRow = {
  provider: "feishu",
  app_id: "cli_app",
  api_secret: "secret",
  api_key: "ou_receiver",
  extra_config: { receiveIdType: "open_id" },
  enabled: true
};

test("resolveChannelFromConfig: 公司未配置 → 停用 + mock + 指向设置页的原因", () => {
  const channel = resolveChannelFromConfig(null);
  assert.equal(channel.enabled, false);
  assert.ok(channel.provider instanceof MockNotificationProvider);
  assert.match(channel.reason ?? "", /未配置通知渠道/);
});

test("resolveChannelFromConfig: 配置齐全的飞书 → 启用，且用该公司自己的接收人", () => {
  const channel = resolveChannelFromConfig(feishuRow);
  assert.equal(channel.enabled, true);
  assert.equal(channel.provider.name, "feishu");
  assert.equal(channel.reason, null);
});

test("resolveChannelFromConfig: enabled=false 或 provider=none → 停用", () => {
  assert.equal(resolveChannelFromConfig({ ...feishuRow, enabled: false }).enabled, false);
  assert.equal(resolveChannelFromConfig({ ...feishuRow, provider: "none" }).enabled, false);
  assert.equal(resolveChannelFromConfig({ ...feishuRow, provider: null }).enabled, false);
});

test("resolveChannelFromConfig: 缺 App ID / Secret / 接收人 → 停用并说明缺哪一项", () => {
  assert.match(resolveChannelFromConfig({ ...feishuRow, app_id: null }).reason ?? "", /App ID/);
  assert.match(resolveChannelFromConfig({ ...feishuRow, api_secret: null }).reason ?? "", /App Secret/);
  assert.match(resolveChannelFromConfig({ ...feishuRow, api_key: null }).reason ?? "", /接收人/);
});

test("resolveChannelFromConfig: 未实现的渠道（企微/钉钉）→ 停用，不崩溃", () => {
  const channel = resolveChannelFromConfig({ ...feishuRow, provider: "wework" });
  assert.equal(channel.enabled, false);
  assert.match(channel.reason ?? "", /尚未接入/);
});

// ── 跨租户隔离：env 凭证不得默认对所有公司生效 ────────────────────────────────

test("resolveEnvFallbackChannel: 未指名公司时不启用 env 兜底（防跨租户误发）", () => {
  const env = { NOTIFY_PROVIDER: "feishu", FEISHU_APP_ID: "a", FEISHU_APP_SECRET: "s" };
  assert.equal(resolveEnvFallbackChannel("c-1", env), null);
  assert.equal(resolveEnvFallbackChannel("c-2", env), null);
});

test("resolveEnvFallbackChannel: 只对被显式指名的那家公司生效", () => {
  const env = {
    NOTIFY_PROVIDER: "feishu",
    FEISHU_APP_ID: "a",
    FEISHU_APP_SECRET: "s",
    NOTIFY_ENV_FALLBACK_COMPANY_ID: "c-1"
  };
  const mine = resolveEnvFallbackChannel("c-1", env);
  assert.ok(mine);
  assert.equal(mine.enabled, true);
  assert.equal(mine.provider.name, "feishu");
  assert.equal(resolveEnvFallbackChannel("c-2", env), null, "别家公司绝不能用到这套 env 凭证");
});

test("resolveEnvFallbackChannel: 指名了公司但 env 缺凭证 → 返回停用渠道而非 null", () => {
  const channel = resolveEnvFallbackChannel("c-1", {
    NOTIFY_PROVIDER: "feishu",
    NOTIFY_ENV_FALLBACK_COMPANY_ID: "c-1"
  });
  assert.ok(channel);
  assert.equal(channel.enabled, false);
});
