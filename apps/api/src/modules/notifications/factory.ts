/**
 * 通知提供方工厂：按 env `NOTIFY_PROVIDER` 选择实现。默认 mock（本地/测试）。
 * feishu → 需 FEISHU_APP_ID/SECRET；未配置则回退 mock，保证不因缺凭证崩溃。
 * 企业微信/钉钉实现待接（同 NotificationProvider 接口，凭证见 secrets/）。
 *
 * `resolveNotificationChannel` 在选择实现之外还回答「这个渠道到底能不能真发」，
 * 供派发层区分「已发送」与「因未配置而跳过」，避免回退 mock 后把跳过误报成成功。
 */

import type { NotificationProvider } from "./provider.js";
import { MockNotificationProvider } from "./mock-provider.js";
import { FeishuNotificationProvider, readFeishuConfig } from "./feishu-provider.js";

export interface ResolvedNotificationChannel {
  readonly provider: NotificationProvider;
  /** true 表示凭证齐备、可以真的对外发送；false 表示只做 no-op。 */
  readonly enabled: boolean;
  /** enabled=false 时说明原因，供日志与设置页排查；enabled=true 时为 null。 */
  readonly reason: string | null;
}

function disabledChannel(reason: string): ResolvedNotificationChannel {
  return { provider: new MockNotificationProvider(), enabled: false, reason };
}

/** 解析当前通知渠道。任何配置缺失都降级为「停用的 mock」，绝不抛错。 */
export function resolveNotificationChannel(
  env: NodeJS.ProcessEnv = process.env
): ResolvedNotificationChannel {
  const choice = (env.NOTIFY_PROVIDER ?? "").trim().toLowerCase();
  if (choice === "" || choice === "none") {
    return disabledChannel("未配置通知渠道（NOTIFY_PROVIDER 未设置或为 none），通知只记录不发送。");
  }
  if (choice === "mock") {
    // 显式选择 mock：本地开发 / E2E 用，视为「已启用」，投递记录为 sent。
    return { provider: new MockNotificationProvider(), enabled: true, reason: null };
  }
  if (choice === "feishu") {
    const config = readFeishuConfig(env);
    if (!config) {
      return disabledChannel("已选飞书但缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，通知只记录不发送。");
    }
    return { provider: new FeishuNotificationProvider(config), enabled: true, reason: null };
  }
  return disabledChannel(`未知通知提供商：${choice}，通知只记录不发送。`);
}

export function createNotificationProvider(env: NodeJS.ProcessEnv = process.env): NotificationProvider {
  return resolveNotificationChannel(env).provider;
}
