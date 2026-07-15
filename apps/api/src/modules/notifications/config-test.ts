/**
 * 通知渠道连接测试 —— 供 POST /api/settings/integrations/notification/test 调用。
 * 字段映射（存 integration_configs）：app_id=App ID，api_secret=App Secret，
 * api_key=默认接收人（open_id/user_id），extra_config.receiveIdType=接收人类型。
 */

import { FeishuNotificationProvider } from "./feishu-provider.js";

export interface NotificationTestInput {
  provider: string;
  apiKey: string | null; // 复用为「默认接收人」
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig?: Record<string, string>;
}

export async function testNotificationProvider(
  input: NotificationTestInput
): Promise<{ ok: boolean; message: string }> {
  if (input.provider === "none" || !input.provider) {
    return { ok: true, message: "未启用通知渠道（none）。" };
  }
  if (input.provider === "feishu") {
    if (!input.appId || !input.apiSecret) {
      return { ok: false, message: "请填写飞书 App ID 与 App Secret。" };
    }
    const provider = new FeishuNotificationProvider({
      appId: input.appId,
      appSecret: input.apiSecret,
      defaultReceiveId: input.apiKey ?? "",
      receiveIdType: input.extraConfig?.receiveIdType ?? "open_id"
    });
    return provider.validateCredentials();
  }
  if (input.provider === "wework" || input.provider === "dingtalk") {
    if (!input.appId || !input.apiSecret) {
      return { ok: false, message: "请填写应用凭证（CorpId/AgentId 与 Secret）。" };
    }
    const label = input.provider === "wework" ? "企业微信" : "钉钉";
    return { ok: false, message: `${label} 连通性测试暂未实现，可先用飞书；凭证格式已就绪。` };
  }
  return { ok: false, message: `未知通知提供商：${input.provider}` };
}
