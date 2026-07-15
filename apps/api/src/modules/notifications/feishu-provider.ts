/**
 * 飞书（Lark）自建应用通知实现 —— 可实现「企业微信」等价的消息推送。
 *
 * 鉴权：App ID + App Secret → tenant_access_token（≤2h，缓存复用）。
 * 发送：POST /open-apis/im/v1/messages（本文实现文本消息，卡片同理）。
 * 纯核心（token URL/请求体、消息体构造、token 是否过期）可单测；网络调用需真实凭证。
 */

import {
  renderNotificationText,
  type NotificationMessage,
  type NotificationProvider,
  type NotificationResult
} from "./provider.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  defaultReceiveId: string;
  /** open_id | user_id | email | chat_id，默认 open_id。 */
  receiveIdType?: string;
}

/** 从环境变量读取飞书配置；缺 App ID/Secret 返回 null（未配置）。 */
export function readFeishuConfig(env: NodeJS.ProcessEnv = process.env): FeishuConfig | null {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    return null;
  }
  return {
    appId,
    appSecret,
    defaultReceiveId: env.FEISHU_DEFAULT_RECEIVE_ID ?? "",
    receiveIdType: env.FEISHU_RECEIVE_ID_TYPE ?? "open_id"
  };
}

/** 纯核心：构造 im/v1/messages 的文本消息请求体。 */
export function buildFeishuTextMessage(message: NotificationMessage, receiveId: string): {
  receive_id: string;
  msg_type: "text";
  content: string;
} {
  return {
    receive_id: receiveId,
    msg_type: "text",
    content: JSON.stringify({ text: renderNotificationText(message) })
  };
}

interface CachedToken {
  token: string;
  /** 过期时间戳（ms）。 */
  expiresAtMs: number;
}

/** 纯核心：判断缓存 token 是否仍可用（留 60s 安全余量）。 */
export function isTokenFresh(cached: CachedToken | null, nowMs: number): boolean {
  return cached !== null && cached.expiresAtMs - 60_000 > nowMs;
}

export class FeishuNotificationProvider implements NotificationProvider {
  readonly name = "feishu";
  private cache: CachedToken | null = null;

  constructor(private readonly config: FeishuConfig) {}

  private async tenantAccessToken(): Promise<string> {
    if (isTokenFresh(this.cache, Date.now())) {
      return this.cache!.token;
    }
    const resp = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret })
    });
    const data = (await resp.json()) as { code: number; tenant_access_token?: string; expire?: number; msg?: string };
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`飞书鉴权失败：${data.msg ?? data.code}`);
    }
    this.cache = { token: data.tenant_access_token, expiresAtMs: Date.now() + (data.expire ?? 7200) * 1000 };
    return this.cache.token;
  }

  /** 连接测试：仅验证 App ID/Secret 能换取 tenant_access_token（不发消息）。 */
  async validateCredentials(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.tenantAccessToken();
      return { ok: true, message: "飞书鉴权成功：tenant_access_token 获取正常。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async send(message: NotificationMessage, opts?: { receiveId?: string }): Promise<NotificationResult> {
    const receiveId = opts?.receiveId ?? this.config.defaultReceiveId;
    if (!receiveId) {
      return { ok: false, provider: this.name, error: "缺少接收人（FEISHU_DEFAULT_RECEIVE_ID 或 receiveId）" };
    }
    try {
      const token = await this.tenantAccessToken();
      const idType = this.config.receiveIdType ?? "open_id";
      const resp = await fetch(`${FEISHU_BASE}/im/v1/messages?receive_id_type=${encodeURIComponent(idType)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildFeishuTextMessage(message, receiveId))
      });
      const data = (await resp.json()) as { code: number; msg?: string; data?: { message_id?: string } };
      if (data.code !== 0) {
        return { ok: false, provider: this.name, error: `飞书发送失败：${data.msg ?? data.code}` };
      }
      return { ok: true, provider: this.name, messageId: data.data?.message_id };
    } catch (error) {
      return { ok: false, provider: this.name, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
