/**
 * 通知派发层 —— 业务事件与通知渠道之间的唯一入口。
 *
 * 设计要点：
 * 1. **绝不阻塞业务主流程**：`dispatch()` 即发即忘（同 services/audit.ts 的 writeAudit），
 *    投递失败只落日志与投递记录，不回传异常、不影响原有写入。
 * 2. **按公司隔离**：渠道按 companyId 从该公司自己的 integration_configs 解析，
 *    绝不让一家公司的通知发到另一家配置的接收人（见 company-channel.ts）。
 * 3. **无凭证时明确降级**：渠道未配置时状态记为 `skipped` 并带上原因，既不静默吞掉，
 *    也不会因为没配置就抛错中断业务。真发只在 `channel.enabled` 时发生。
 * 4. **失败可见**：每次投递都进按公司的有界历史（GET /api/notifications/deliveries），
 *    失败额外落 error 级结构化日志。
 * 5. **不被外部拖垮**：单次发送有超时上限，排队深度有上限，避免某个渠道卡死时
 *    队列无限堆积、拖累其他公司的通知。
 * 6. **可测**：渠道解析与 logger 均可注入，单测不发任何网络请求、不碰数据库。
 */

import { logger as defaultLogger, type Logger } from "../../observability/logger.js";
import type { ResolvedNotificationChannel } from "./factory.js";
import { loadCompanyChannel } from "./company-channel.js";
import { buildDeepLink, type DeepLinkEvent } from "./deep-link.js";
import type { NotificationKind, NotificationMessage, NotificationResult } from "./provider.js";

/** 每家公司保留的最近投递条数（进程内，仅用于排查，不做持久化）。 */
const DEFAULT_HISTORY_LIMIT = 50;
/** 单次发送的超时上限：外部渠道卡死时不拖垮整条队列。 */
const DEFAULT_SEND_TIMEOUT_MS = 10_000;
/** 待投递队列的最大深度：渠道长时间不可用时丢弃并留痕，而非无限堆积。 */
const DEFAULT_MAX_QUEUE_DEPTH = 500;

export type NotificationDeliveryStatus = "sent" | "failed" | "skipped";

export interface NotificationRequest {
  readonly kind: NotificationKind;
  readonly companyId: string;
  readonly title: string;
  readonly body: string;
  /** 可选深链场景；由 deep-link.ts 转成绝对 URL 后放进消息体。 */
  readonly deepLink?: DeepLinkEvent;
  /** 可选接收人；缺省用该公司渠道配置里的默认接收人。 */
  readonly receiveId?: string;
}

export interface NotificationDelivery {
  readonly at: string;
  readonly companyId: string;
  readonly kind: NotificationKind;
  readonly provider: string;
  readonly status: NotificationDeliveryStatus;
  readonly link: string | null;
  readonly messageId: string | null;
  /** 失败原因，或跳过原因（未配置渠道）。成功时为 null。 */
  readonly error: string | null;
}

export interface ChannelStatus {
  readonly provider: string;
  readonly enabled: boolean;
  readonly disabledReason: string | null;
}

export interface NotificationDispatcher {
  /** 即发即忘：不返回 Promise，调用方无需 await，异常不外泄。 */
  dispatch(request: NotificationRequest): void;
  /** 可等待版本：供调度任务与测试使用。永不 reject。 */
  deliver(request: NotificationRequest): Promise<NotificationDelivery>;
  /** 某公司当前的渠道状态（供设置页/排查展示）。 */
  describeChannel(companyId: string): Promise<ChannelStatus>;
  /** 最近投递记录快照（可按公司过滤）。返回副本，外部改不动内部状态。 */
  recentDeliveries(companyId?: string): readonly NotificationDelivery[];
  /** 等待队列中所有投递结束（优雅关闭 / 确定性测试）。 */
  drain(): Promise<void>;
}

export interface NotificationDispatcherOptions {
  /** 固定渠道：给了就对所有公司使用同一渠道（仅测试/单公司自托管）。 */
  readonly channel?: ResolvedNotificationChannel;
  /** 按公司解析渠道；缺省读该公司的 integration_configs。 */
  readonly resolveChannel?: (companyId: string) => Promise<ResolvedNotificationChannel>;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: Logger;
  readonly historyLimit?: number;
  readonly sendTimeoutMs?: number;
  readonly maxQueueDepth?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 边界校验：外发消息必须有公司与标题，否则记为失败而不是发出一条空通知。 */
function validateRequest(request: NotificationRequest): string | null {
  if (request.companyId.trim() === "") {
    return "通知缺少 companyId";
  }
  if (request.title.trim() === "") {
    return "通知缺少标题";
  }
  return null;
}

/**
 * 给一次发送套上超时；渠道无响应时按失败处理而不是永远挂着。
 *
 * provider.send 的 rejection 先就地收敛成 NotificationResult 再参与 race：
 * 否则一旦超时先赢，落败的 send 之后才 reject，就会变成进程级 unhandledRejection。
 * NotificationProvider 接口并不保证实现「永不 reject」，故必须在此兜住。
 */
async function sendWithTimeout(
  channel: ResolvedNotificationChannel,
  message: NotificationMessage,
  opts: { receiveId?: string } | undefined,
  timeoutMs: number
): Promise<NotificationResult> {
  const sending: Promise<NotificationResult> = channel.provider
    .send(message, opts)
    .catch((error: unknown) => ({
      ok: false,
      provider: channel.provider.name,
      error: errorMessage(error)
    }));

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`通知发送超时（${timeoutMs}ms）`)), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([sending, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function createNotificationDispatcher(
  options: NotificationDispatcherOptions = {}
): NotificationDispatcher {
  const env = options.env ?? process.env;
  const log = (options.log ?? defaultLogger).child({ component: "notifications" });
  const historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
  const sendTimeoutMs = Math.max(1, options.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS);
  const maxQueueDepth = Math.max(1, options.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH);

  const fixedChannel = options.channel;
  const resolveChannel =
    options.resolveChannel ??
    (fixedChannel
      ? async () => fixedChannel
      : (companyId: string) => loadCompanyChannel(companyId, env));

  /** 按公司分桶的有界历史：一家公司刷屏不会把另一家的记录挤掉。 */
  let history: ReadonlyMap<string, readonly NotificationDelivery[]> = new Map();
  let queue: Promise<void> = Promise.resolve();
  let pendingCount = 0;

  function record(delivery: NotificationDelivery): NotificationDelivery {
    const previous = history.get(delivery.companyId) ?? [];
    const next = new Map(history);
    next.set(delivery.companyId, [...previous, delivery].slice(-historyLimit));
    history = next;
    return delivery;
  }

  function makeDelivery(
    request: NotificationRequest,
    provider: string,
    status: NotificationDeliveryStatus,
    extra: { link?: string | null; messageId?: string | null; error?: string | null } = {}
  ): NotificationDelivery {
    return {
      at: new Date().toISOString(),
      companyId: request.companyId,
      kind: request.kind,
      provider,
      status,
      link: extra.link ?? null,
      messageId: extra.messageId ?? null,
      error: extra.error ?? null
    };
  }

  async function deliver(request: NotificationRequest): Promise<NotificationDelivery> {
    try {
      const invalid = validateRequest(request);
      if (invalid) {
        log.error("notification request rejected", { kind: request.kind, reason: invalid });
        return record(makeDelivery(request, "none", "failed", { error: invalid }));
      }

      const channel = await resolveChannel(request.companyId);
      const link = request.deepLink ? buildDeepLink(request.deepLink, env) : null;
      const providerName = channel.provider.name;

      if (!channel.enabled) {
        // 未配置渠道：不发送，但必须留下可查的记录 —— 不静默吞掉，也不抛错。
        log.debug("notification skipped (channel not configured)", {
          kind: request.kind,
          companyId: request.companyId,
          reason: channel.reason
        });
        return record(makeDelivery(request, providerName, "skipped", { link, error: channel.reason }));
      }

      const message: NotificationMessage = {
        kind: request.kind,
        title: request.title,
        body: request.body,
        ...(link ? { link } : {})
      };
      const result = await sendWithTimeout(
        channel,
        message,
        request.receiveId ? { receiveId: request.receiveId } : undefined,
        sendTimeoutMs
      );

      if (!result.ok) {
        log.error("notification delivery failed", {
          kind: request.kind,
          companyId: request.companyId,
          provider: result.provider,
          error: result.error
        });
        return record(
          makeDelivery(request, providerName, "failed", { link, error: result.error ?? "未知投递错误" })
        );
      }

      log.info("notification delivered", {
        kind: request.kind,
        companyId: request.companyId,
        provider: result.provider,
        messageId: result.messageId
      });
      return record(
        makeDelivery(request, providerName, "sent", { link, messageId: result.messageId ?? null })
      );
    } catch (error) {
      const message = errorMessage(error);
      log.error("notification delivery threw", {
        kind: request.kind,
        companyId: request.companyId,
        error: message
      });
      return record(makeDelivery(request, "unknown", "failed", { error: message }));
    }
  }

  function dispatch(request: NotificationRequest): void {
    if (pendingCount >= maxQueueDepth) {
      // 渠道长时间不可用：丢弃并留痕，好过把进程内存堆满。
      log.error("notification dropped (queue full)", {
        kind: request.kind,
        companyId: request.companyId,
        pendingCount
      });
      record(makeDelivery(request, "none", "failed", { error: `通知队列已满（${maxQueueDepth}），本条被丢弃` }));
      return;
    }
    // 串行排队，避免业务高峰时并发外呼打满渠道限频；单条失败不会毒化队列。
    pendingCount += 1;
    const run = () =>
      deliver(request).then(
        () => {
          pendingCount -= 1;
        },
        () => {
          pendingCount -= 1;
        }
      );
    queue = queue.then(run, run);
  }

  return {
    dispatch,
    deliver,
    describeChannel: async (companyId: string) => {
      try {
        const channel = await resolveChannel(companyId);
        return {
          provider: channel.provider.name,
          enabled: channel.enabled,
          disabledReason: channel.reason
        };
      } catch (error) {
        return { provider: "unknown", enabled: false, disabledReason: errorMessage(error) };
      }
    },
    recentDeliveries: (companyId?: string) => {
      if (companyId !== undefined) {
        return [...(history.get(companyId) ?? [])];
      }
      return [...history.values()].flat();
    },
    drain: async () => {
      await queue;
    }
  };
}

let defaultDispatcher: NotificationDispatcher | null = null;

/** 进程级默认派发器（懒初始化）。渠道按公司解析，故此处不打印全局渠道状态。 */
export function getNotificationDispatcher(): NotificationDispatcher {
  if (defaultDispatcher === null) {
    defaultDispatcher = createNotificationDispatcher();
  }
  return defaultDispatcher;
}

/** 测试注入用；传 null 恢复默认。 */
export function setNotificationDispatcher(dispatcher: NotificationDispatcher | null): void {
  defaultDispatcher = dispatcher;
}

/**
 * 业务代码的统一调用点：即发即忘，绝不影响主流程。
 * 传 null 表示「本次不值得推送」，直接跳过 —— 方便与 events.ts 的构造函数串联。
 *
 * 这里的 try/catch 是最后一道防线：即便派发器构造或 dispatch 本身同步抛错
 * （错配置、注入了异常实现），业务写入也已经完成，绝不能因为通知而回吐失败。
 */
export function notify(request: NotificationRequest | null): void {
  if (request === null) {
    return;
  }
  try {
    getNotificationDispatcher().dispatch(request);
  } catch (error) {
    defaultLogger.error("notification dispatch rejected", {
      component: "notifications",
      kind: request.kind,
      companyId: request.companyId,
      error: errorMessage(error)
    });
  }
}
