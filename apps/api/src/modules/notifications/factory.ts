/**
 * 通知提供方工厂：按 env `NOTIFY_PROVIDER` 选择实现。默认 mock（本地/测试）。
 * feishu → 需 FEISHU_APP_ID/SECRET；未配置则回退 mock，保证不因缺凭证崩溃。
 * 企业微信/钉钉实现待接（同 NotificationProvider 接口，凭证见 secrets/）。
 */

import type { NotificationProvider } from "./provider.js";
import { MockNotificationProvider } from "./mock-provider.js";
import { FeishuNotificationProvider, readFeishuConfig } from "./feishu-provider.js";

export function createNotificationProvider(env: NodeJS.ProcessEnv = process.env): NotificationProvider {
  const choice = (env.NOTIFY_PROVIDER ?? "mock").toLowerCase();
  if (choice === "feishu") {
    const config = readFeishuConfig(env);
    if (config) {
      return new FeishuNotificationProvider(config);
    }
    // 选了 feishu 但缺凭证：回退 mock，避免运行时崩溃（部署时补 secrets 即生效）。
  }
  return new MockNotificationProvider();
}
