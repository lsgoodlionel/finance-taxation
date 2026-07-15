import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeishuTextMessage, isTokenFresh, readFeishuConfig } from "./feishu-provider.js";
import { renderNotificationText, type NotificationMessage } from "./provider.js";
import { createNotificationProvider } from "./factory.js";
import { MockNotificationProvider } from "./mock-provider.js";

const msg: NotificationMessage = {
  kind: "close_completed",
  title: "月结已完成",
  body: "2026-05 结账全部步骤已通过",
  link: "https://app/close"
};

test("renderNotificationText 拼接标题/正文/链接，忽略空行", () => {
  assert.equal(renderNotificationText(msg), "月结已完成\n2026-05 结账全部步骤已通过\nhttps://app/close");
  assert.equal(renderNotificationText({ ...msg, link: undefined }), "月结已完成\n2026-05 结账全部步骤已通过");
});

test("buildFeishuTextMessage 构造 im/v1/messages 文本请求体", () => {
  const payload = buildFeishuTextMessage(msg, "ou_abc");
  assert.equal(payload.receive_id, "ou_abc");
  assert.equal(payload.msg_type, "text");
  assert.deepEqual(JSON.parse(payload.content), { text: renderNotificationText(msg) });
});

test("isTokenFresh 留 60s 余量", () => {
  assert.equal(isTokenFresh(null, 1000), false);
  assert.equal(isTokenFresh({ token: "t", expiresAtMs: 100_000 }, 30_000), true);
  assert.equal(isTokenFresh({ token: "t", expiresAtMs: 100_000 }, 50_000), false); // 50s 内到期 → 视为过期
});

test("readFeishuConfig 缺 App ID/Secret 返回 null", () => {
  assert.equal(readFeishuConfig({}), null);
  assert.equal(readFeishuConfig({ FEISHU_APP_ID: "a" }), null);
  const cfg = readFeishuConfig({ FEISHU_APP_ID: "a", FEISHU_APP_SECRET: "s" });
  assert.ok(cfg && cfg.appId === "a" && cfg.receiveIdType === "open_id");
});

test("factory 默认/未配置飞书 → 回退 mock，不崩溃", () => {
  assert.ok(createNotificationProvider({}) instanceof MockNotificationProvider);
  assert.ok(createNotificationProvider({ NOTIFY_PROVIDER: "feishu" }) instanceof MockNotificationProvider);
  assert.equal(createNotificationProvider({ NOTIFY_PROVIDER: "feishu", FEISHU_APP_ID: "a", FEISHU_APP_SECRET: "s" }).name, "feishu");
});
