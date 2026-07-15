/**
 * 本地/测试用通知实现：不实际发送，返回成功并携带确定性 messageId，便于 E2E/单测。
 */

import type { NotificationMessage, NotificationProvider, NotificationResult } from "./provider.js";

export class MockNotificationProvider implements NotificationProvider {
  readonly name = "mock";
  readonly sent: NotificationMessage[] = [];

  async send(message: NotificationMessage): Promise<NotificationResult> {
    this.sent.push(message);
    return { ok: true, provider: this.name, messageId: `mock-${message.kind}-${this.sent.length}` };
  }
}
