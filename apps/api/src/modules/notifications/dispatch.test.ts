import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNotificationDispatcher,
  notify,
  setNotificationDispatcher,
  type NotificationDispatcher,
  type NotificationRequest
} from "./dispatch.js";
import { resolveNotificationChannel } from "./factory.js";
import { MockNotificationProvider } from "./mock-provider.js";
import type { LogFields, Logger } from "../../observability/logger.js";
import type { NotificationMessage, NotificationProvider, NotificationResult } from "./provider.js";

/** 收集日志而非写 stdout，便于断言「失败必须留痕」。 */
function recordingLogger(): { log: Logger; entries: { level: string; msg: string; fields?: LogFields }[] } {
  const entries: { level: string; msg: string; fields?: LogFields }[] = [];
  const make = (base: LogFields): Logger => ({
    debug: (msg, fields) => entries.push({ level: "debug", msg, fields: { ...base, ...fields } }),
    info: (msg, fields) => entries.push({ level: "info", msg, fields: { ...base, ...fields } }),
    warn: (msg, fields) => entries.push({ level: "warn", msg, fields: { ...base, ...fields } }),
    error: (msg, fields) => entries.push({ level: "error", msg, fields: { ...base, ...fields } }),
    child: (childBase) => make({ ...base, ...childBase })
  });
  return { log: make({}), entries };
}

class FailingProvider implements NotificationProvider {
  readonly name = "failing";
  async send(): Promise<NotificationResult> {
    return { ok: false, provider: this.name, error: "飞书发送失败：invalid receive_id" };
  }
}

class ThrowingProvider implements NotificationProvider {
  readonly name = "throwing";
  async send(): Promise<NotificationResult> {
    throw new Error("socket hang up");
  }
}

const request: NotificationRequest = {
  kind: "risk_alert",
  companyId: "c-1",
  title: "发现 2 项高风险",
  body: "合同金额超预算",
  deepLink: { type: "risk_finding", findingId: "f-1", businessEventId: "e-1" }
};

// ── 渠道解析：无凭证降级 ───────────────────────────────────────────────────────

test("resolveNotificationChannel: 未配置 NOTIFY_PROVIDER → 停用 + mock + 明确原因", () => {
  const channel = resolveNotificationChannel({});
  assert.equal(channel.enabled, false);
  assert.ok(channel.provider instanceof MockNotificationProvider);
  assert.match(channel.reason ?? "", /NOTIFY_PROVIDER/);
});

test("resolveNotificationChannel: none 显式关闭；mock 显式启用（本地/E2E）", () => {
  assert.equal(resolveNotificationChannel({ NOTIFY_PROVIDER: "none" }).enabled, false);
  const mock = resolveNotificationChannel({ NOTIFY_PROVIDER: "mock" });
  assert.equal(mock.enabled, true);
  assert.equal(mock.reason, null);
});

test("resolveNotificationChannel: 选飞书但缺凭证 → 停用并说明缺哪一项，绝不抛错", () => {
  const channel = resolveNotificationChannel({ NOTIFY_PROVIDER: "feishu" });
  assert.equal(channel.enabled, false);
  assert.ok(channel.provider instanceof MockNotificationProvider);
  assert.match(channel.reason ?? "", /FEISHU_APP_ID/);
});

test("resolveNotificationChannel: 飞书凭证齐全 → 启用飞书", () => {
  const channel = resolveNotificationChannel({
    NOTIFY_PROVIDER: "feishu",
    FEISHU_APP_ID: "a",
    FEISHU_APP_SECRET: "s"
  });
  assert.equal(channel.enabled, true);
  assert.equal(channel.provider.name, "feishu");
});

test("resolveNotificationChannel: 未知提供商 → 停用并留原因，不崩溃", () => {
  const channel = resolveNotificationChannel({ NOTIFY_PROVIDER: "telegram" });
  assert.equal(channel.enabled, false);
  assert.match(channel.reason ?? "", /telegram/);
});

// ── 派发行为 ──────────────────────────────────────────────────────────────────

test("deliver: 启用时发送成功，消息携带深链，投递记录为 sent", async () => {
  const provider = new MockNotificationProvider();
  const { log, entries } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider, enabled: true, reason: null },
    env: { APP_BASE_URL: "https://ft.example.com" },
    log
  });

  const delivery = await dispatcher.deliver(request);

  assert.equal(delivery.status, "sent");
  assert.equal(delivery.provider, "mock");
  assert.equal(delivery.link, "https://ft.example.com/risk?finding=f-1&event=e-1");
  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0]!.link, "https://ft.example.com/risk?finding=f-1&event=e-1");
  assert.equal(provider.sent[0]!.kind, "risk_alert");
  assert.ok(entries.some((e) => e.level === "info"));
});

test("deliver: 未配置渠道 → skipped，不实际发送，但留下可观测记录与原因", async () => {
  const provider = new MockNotificationProvider();
  const { log, entries } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider, enabled: false, reason: "未配置通知渠道（NOTIFY_PROVIDER 未设置）" },
    env: {},
    log
  });

  const delivery = await dispatcher.deliver(request);

  assert.equal(delivery.status, "skipped");
  assert.equal(provider.sent.length, 0, "停用时绝不能真的发送");
  assert.match(delivery.error ?? "", /未配置通知渠道/);
  assert.equal(dispatcher.recentDeliveries("c-1").length, 1, "跳过也必须留痕，不能静默吞掉");
  assert.ok(entries.length > 0, "跳过必须有日志");
});

test("deliver: provider 返回 ok=false → failed + error 级日志（失败可见）", async () => {
  const { log, entries } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: new FailingProvider(), enabled: true, reason: null },
    env: {},
    log
  });

  const delivery = await dispatcher.deliver(request);

  assert.equal(delivery.status, "failed");
  assert.match(delivery.error ?? "", /invalid receive_id/);
  assert.ok(entries.some((e) => e.level === "error"), "投递失败必须落 error 日志");
});

test("deliver: provider 抛异常 → 收敛为 failed，绝不向调用方抛出", async () => {
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: new ThrowingProvider(), enabled: true, reason: null },
    env: {},
    log
  });

  const delivery = await dispatcher.deliver(request);

  assert.equal(delivery.status, "failed");
  assert.match(delivery.error ?? "", /socket hang up/);
});

test("deliver: 入参非法（缺 companyId/title）→ failed，不发送", async () => {
  const provider = new MockNotificationProvider();
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider, enabled: true, reason: null },
    env: {},
    log
  });

  const bad = await dispatcher.deliver({ ...request, companyId: "  " });
  assert.equal(bad.status, "failed");
  const noTitle = await dispatcher.deliver({ ...request, title: "" });
  assert.equal(noTitle.status, "failed");
  assert.equal(provider.sent.length, 0);
});

test("dispatch: 即发即忘不返回 Promise，drain 后可断言结果", async () => {
  const provider = new MockNotificationProvider();
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider, enabled: true, reason: null },
    env: {},
    log
  });

  assert.equal(dispatcher.dispatch(request), undefined);
  await dispatcher.drain();

  assert.equal(provider.sent.length, 1);
  assert.equal(dispatcher.recentDeliveries()[0]!.status, "sent");
});

test("dispatch: 单条失败不影响后续投递（队列不被毒化）", async () => {
  let call = 0;
  const flaky: NotificationProvider = {
    name: "flaky",
    async send(message: NotificationMessage): Promise<NotificationResult> {
      call += 1;
      if (call === 1) {
        throw new Error("boom");
      }
      return { ok: true, provider: "flaky", messageId: `m-${message.kind}` };
    }
  };
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: flaky, enabled: true, reason: null },
    env: {},
    log
  });

  dispatcher.dispatch(request);
  dispatcher.dispatch({ ...request, kind: "approval_request" });
  await dispatcher.drain();

  const history = dispatcher.recentDeliveries();
  assert.equal(history.length, 2);
  assert.equal(history[0]!.status, "failed");
  assert.equal(history[1]!.status, "sent");
});

test("recentDeliveries 历史按公司分桶且各自有界：吵闹的公司挤不掉安静公司的记录", async () => {
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: new MockNotificationProvider(), enabled: true, reason: null },
    env: {},
    log,
    historyLimit: 3
  });

  for (let i = 0; i < 5; i += 1) {
    dispatcher.dispatch({ ...request, body: `n-${i}` });
  }
  dispatcher.dispatch({ ...request, companyId: "c-2" });
  await dispatcher.drain();

  assert.equal(dispatcher.recentDeliveries("c-1").length, 3, "单公司历史应被 historyLimit 截断");
  assert.equal(dispatcher.recentDeliveries("c-2").length, 1, "安静公司的记录不应被挤掉");
  assert.equal(dispatcher.recentDeliveries("c-404").length, 0);
});

// ── 多租户隔离与自我保护 ──────────────────────────────────────────────────────

test("deliver 按 companyId 解析渠道：各公司只用自己的配置与接收人", async () => {
  const sentByCompany: Record<string, MockNotificationProvider> = {
    "c-1": new MockNotificationProvider(),
    "c-2": new MockNotificationProvider()
  };
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    resolveChannel: async (companyId) => {
      const provider = sentByCompany[companyId];
      return provider
        ? { provider, enabled: true, reason: null }
        : { provider: new MockNotificationProvider(), enabled: false, reason: "未配置" };
    },
    env: {},
    log
  });

  await dispatcher.deliver({ ...request, companyId: "c-1" });
  await dispatcher.deliver({ ...request, companyId: "c-2", title: "c2 的通知" });
  const unknown = await dispatcher.deliver({ ...request, companyId: "c-3" });

  assert.equal(sentByCompany["c-1"]!.sent.length, 1);
  assert.equal(sentByCompany["c-2"]!.sent.length, 1);
  assert.equal(sentByCompany["c-2"]!.sent[0]!.title, "c2 的通知");
  assert.equal(sentByCompany["c-1"]!.sent[0]!.title, request.title, "不得串到别家公司");
  assert.equal(unknown.status, "skipped", "未配置渠道的公司不发送");
});

test("deliver: 渠道解析失败（如读库出错）收敛为 failed，不外抛", async () => {
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    resolveChannel: async () => {
      throw new Error("connection refused");
    },
    env: {},
    log
  });

  const delivery = await dispatcher.deliver(request);
  assert.equal(delivery.status, "failed");
  assert.match(delivery.error ?? "", /connection refused/);
});

test("deliver: provider 卡死时按超时失败，不永久挂起队列", async () => {
  const stalling: NotificationProvider = {
    name: "stalling",
    send: () => new Promise<NotificationResult>(() => undefined) // 永不 settle
  };
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: stalling, enabled: true, reason: null },
    env: {},
    log,
    sendTimeoutMs: 20
  });

  const delivery = await dispatcher.deliver(request);
  assert.equal(delivery.status, "failed");
  assert.match(delivery.error ?? "", /超时/);
});

test("deliver: provider 在超时判负后才 reject，不得产生 unhandledRejection", async () => {
  const rejectAfterTimeout: NotificationProvider = {
    name: "late-rejecter",
    send: () =>
      new Promise<NotificationResult>((_resolve, reject) => {
        setTimeout(() => reject(new Error("late failure")), 40).unref?.();
      })
  };
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  try {
    const { log } = recordingLogger();
    const dispatcher = createNotificationDispatcher({
      channel: { provider: rejectAfterTimeout, enabled: true, reason: null },
      env: {},
      log,
      sendTimeoutMs: 10
    });

    const delivery = await dispatcher.deliver(request);
    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /超时/);

    // 等到落败的 send 真正 reject 之后，再断言没有逃逸的 rejection
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(unhandled, [], "落败的 send 的 rejection 必须被就地收敛");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("dispatch: 队列积压到上限后丢弃并留痕，而不是无限堆内存", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: NotificationProvider = {
    name: "slow",
    async send(): Promise<NotificationResult> {
      await gate;
      return { ok: true, provider: "slow" };
    }
  };
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: slow, enabled: true, reason: null },
    env: {},
    log,
    maxQueueDepth: 2
  });

  dispatcher.dispatch(request);
  dispatcher.dispatch(request);
  dispatcher.dispatch(request); // 超出深度上限 → 立即丢弃并记录

  const dropped = dispatcher.recentDeliveries("c-1").filter((item) => item.status === "failed");
  assert.equal(dropped.length, 1, "超出上限的那条必须留痕，不能静默消失");
  assert.match(dropped[0]!.error ?? "", /队列已满/);

  release!();
  await dispatcher.drain();
});

test("describeChannel 报告某公司的渠道状态（供设置页排查）", async () => {
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    resolveChannel: async (companyId) =>
      companyId === "c-1"
        ? { provider: new MockNotificationProvider(), enabled: true, reason: null }
        : { provider: new MockNotificationProvider(), enabled: false, reason: "该公司未配置通知渠道" },
    env: {},
    log
  });

  assert.deepEqual(await dispatcher.describeChannel("c-1"), {
    provider: "mock",
    enabled: true,
    disabledReason: null
  });
  assert.deepEqual(await dispatcher.describeChannel("c-9"), {
    provider: "mock",
    enabled: false,
    disabledReason: "该公司未配置通知渠道"
  });
});

// ── notify(): 业务代码调用的最后一道防线 ──────────────────────────────────────

test("notify(null) 是空操作，配合 events.ts 的「不值得推送」返回值", () => {
  const calls: NotificationRequest[] = [];
  setNotificationDispatcher({
    dispatch: (r: NotificationRequest) => void calls.push(r),
    deliver: async () => {
      throw new Error("unused");
    },
    describeChannel: async () => ({ provider: "spy", enabled: true, disabledReason: null }),
    recentDeliveries: () => [],
    drain: async () => undefined
  } as unknown as NotificationDispatcher);

  try {
    notify(null);
    assert.equal(calls.length, 0);
    notify(request);
    assert.equal(calls.length, 1);
  } finally {
    setNotificationDispatcher(null);
  }
});

test("notify 吞掉派发器的同步异常，业务调用方绝不受影响", () => {
  setNotificationDispatcher({
    dispatch: () => {
      throw new Error("dispatcher exploded");
    },
    deliver: async () => {
      throw new Error("unused");
    },
    describeChannel: async () => ({ provider: "exploding", enabled: true, disabledReason: null }),
    recentDeliveries: () => [],
    drain: async () => undefined
  } as unknown as NotificationDispatcher);

  try {
    assert.doesNotThrow(() => notify(request));
  } finally {
    setNotificationDispatcher(null);
  }
});

test("recentDeliveries 返回快照，外部无法改写内部状态（不可变）", async () => {
  const { log } = recordingLogger();
  const dispatcher = createNotificationDispatcher({
    channel: { provider: new MockNotificationProvider(), enabled: true, reason: null },
    env: {},
    log
  });
  dispatcher.dispatch(request);
  await dispatcher.drain();

  const snapshot = dispatcher.recentDeliveries() as unknown as unknown[];
  snapshot.push({ tampered: true });
  assert.equal(dispatcher.recentDeliveries().length, 1);
});
