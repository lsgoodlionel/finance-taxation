/**
 * 按公司解析通知渠道 —— 多租户下的收件人隔离。
 *
 * 凭证的**唯一事实来源是每家公司自己在设置页填的 integration_configs
 * (config_type='notification')**：app_id=App ID，api_secret=App Secret，
 * api_key=默认接收人，extra_config.receiveIdType=接收人类型。
 *
 * 进程级 env（FEISHU_*）不再默认对所有公司生效 —— 那会把 A 公司的凭证/收件人
 * 用到 B 公司的通知上，造成跨租户泄露。只有显式设置
 * `NOTIFY_ENV_FALLBACK_COMPANY_ID=<公司 id>` 时，env 凭证才对该公司生效
 * （自托管单公司部署的便利路径）。
 */

import { queryOne } from "../../db/client.js";
import { logger } from "../../observability/logger.js";
import { FeishuNotificationProvider } from "./feishu-provider.js";
import { MockNotificationProvider } from "./mock-provider.js";
import { resolveNotificationChannel, type ResolvedNotificationChannel } from "./factory.js";

/** 渠道解析结果的缓存时长；设置页改配置后最多 60s 生效。 */
const CHANNEL_CACHE_TTL_MS = 60_000;

export interface CompanyNotificationConfigRow {
  readonly provider: string | null;
  readonly app_id: string | null;
  readonly api_secret: string | null;
  readonly api_key: string | null;
  readonly extra_config: Record<string, string> | null;
  readonly enabled: boolean | null;
}

function disabledChannel(reason: string): ResolvedNotificationChannel {
  return { provider: new MockNotificationProvider(), enabled: false, reason };
}

/**
 * 纯核心：把一行 integration_configs 解析成渠道。row 为 null 表示该公司没配。
 * 任何字段缺失都降级为「停用」并说明原因，绝不抛错。
 */
export function resolveChannelFromConfig(
  row: CompanyNotificationConfigRow | null
): ResolvedNotificationChannel {
  if (row === null) {
    return disabledChannel("该公司未配置通知渠道（设置 → 集成配置 → 通知），通知只记录不发送。");
  }
  if (row.enabled === false) {
    return disabledChannel("该公司的通知渠道已停用，通知只记录不发送。");
  }
  const provider = (row.provider ?? "none").trim().toLowerCase();
  if (provider === "none" || provider === "") {
    return disabledChannel("该公司的通知渠道为「不启用」，通知只记录不发送。");
  }
  if (provider === "feishu") {
    if (!row.app_id || !row.api_secret) {
      return disabledChannel("飞书配置缺少 App ID 或 App Secret，通知只记录不发送。");
    }
    if (!row.api_key) {
      return disabledChannel("飞书配置缺少默认接收人，通知只记录不发送。");
    }
    return {
      provider: new FeishuNotificationProvider({
        appId: row.app_id,
        appSecret: row.api_secret,
        defaultReceiveId: row.api_key,
        receiveIdType: row.extra_config?.receiveIdType ?? "open_id"
      }),
      enabled: true,
      reason: null
    };
  }
  return disabledChannel(`${provider} 渠道的推送实现尚未接入，通知只记录不发送。`);
}

/**
 * env 兜底：仅当 NOTIFY_ENV_FALLBACK_COMPANY_ID 明确指向本公司时才启用，
 * 避免自托管的单套 env 凭证被用到其他租户身上。
 */
export function resolveEnvFallbackChannel(
  companyId: string,
  env: NodeJS.ProcessEnv
): ResolvedNotificationChannel | null {
  const allowed = (env.NOTIFY_ENV_FALLBACK_COMPANY_ID ?? "").trim();
  if (allowed === "" || allowed !== companyId) {
    return null;
  }
  return resolveNotificationChannel(env);
}

interface CacheEntry {
  readonly channel: ResolvedNotificationChannel;
  readonly expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

/** 清空渠道缓存（测试用，或配置变更后主动失效）。 */
export function clearCompanyChannelCache(): void {
  cache.clear();
}

/**
 * 读取某公司的通知渠道（带 TTL 缓存，复用 provider 实例以保留飞书 token 缓存）。
 * 读库失败一律降级为停用渠道并留日志，绝不让通知问题冒泡到业务路径。
 */
export async function loadCompanyChannel(
  companyId: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now()
): Promise<ResolvedNotificationChannel> {
  const cached = cache.get(companyId);
  if (cached && cached.expiresAtMs > nowMs) {
    return cached.channel;
  }

  let channel: ResolvedNotificationChannel;
  try {
    const row = await queryOne<CompanyNotificationConfigRow>(
      `select provider, app_id, api_secret, api_key, extra_config, enabled
         from integration_configs
        where company_id = $1 and config_type = 'notification'`,
      [companyId]
    );
    channel = resolveChannelFromConfig(row);
    if (!channel.enabled) {
      // 公司没配才考虑 env 兜底，且只对被显式指名的那家公司生效。
      channel = resolveEnvFallbackChannel(companyId, env) ?? channel;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("failed to load company notification channel", {
      component: "notifications",
      companyId,
      error: message
    });
    channel = disabledChannel(`读取通知配置失败：${message}`);
  }

  cache.set(companyId, { channel, expiresAtMs: nowMs + CHANNEL_CACHE_TTL_MS });
  return channel;
}
