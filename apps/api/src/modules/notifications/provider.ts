/**
 * 通知连接器抽象 —— 为企业通知渠道（飞书 / 企业微信 / 钉钉）预留统一接口。
 *
 * 应用只依赖 NotificationProvider 接口；本地/测试用 MockNotificationProvider，
 * 生产按 env 选择 FeishuNotificationProvider（或企微/钉钉实现，需外部凭证）。
 * 镜像 tax-integration/invoicing 的 provider 抽象，保持一致的可切换设计。
 */

export type NotificationKind = "task_overdue" | "risk_alert" | "approval_request" | "close_completed";

export interface NotificationMessage {
  kind: NotificationKind;
  title: string;
  body: string;
  /** 可选：点击跳转的应用内链接。 */
  link?: string;
}

export interface NotificationResult {
  ok: boolean;
  /** 提供方标识，如 'mock' / 'feishu' / 'wework'。 */
  provider: string;
  messageId?: string;
  error?: string;
}

export interface NotificationProvider {
  readonly name: string;
  /** 发送一条通知；receiveId 缺省时用提供方配置的默认接收人。 */
  send(message: NotificationMessage, opts?: { receiveId?: string }): Promise<NotificationResult>;
}

/** 把结构化通知渲染为纯文本正文（各渠道文本消息通用）。 */
export function renderNotificationText(message: NotificationMessage): string {
  const lines = [message.title, message.body];
  if (message.link) {
    lines.push(message.link);
  }
  return lines.filter((line) => line && line.trim() !== "").join("\n");
}
