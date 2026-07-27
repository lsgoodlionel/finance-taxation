/**
 * 业务事件 → 通知消息的映射（纯函数，无 I/O）。
 *
 * **推送噪音的取舍集中在这里**，业务模块只负责把事实传进来：
 * - 风险：只推 high，且只推「本次扫描新增」的（finding id 确定性，重扫不重推）。
 * - 凭证：只在送审（draft → review_required）时推一次；过账是审批的结果，不再推。
 * - AI 草稿：按批次汇总一条，不按草稿逐条推。
 * - 逾期任务：按公司汇总一条。
 * 返回 null 表示「本次不值得推送」，交给 dispatch.notify() 直接跳过。
 */

import type { DeepLinkEvent } from "./deep-link.js";
import type { NotificationRequest } from "./dispatch.js";

/** 正文里最多列出的明细条数，超出只给总数，避免消息过长。 */
const MAX_DETAIL_LINES = 3;

export interface RiskFindingSummary {
  readonly id: string;
  readonly severity: "low" | "medium" | "high";
  readonly title: string;
  readonly businessEventId: string | null;
}

export interface RiskAlertInput {
  readonly companyId: string;
  readonly eventLabel: string;
  readonly findings: readonly RiskFindingSummary[];
  /**
   * 本次扫描前已存在的 finding id，用于只推新增。
   *
   * 前提：finding id 为 `${ruleCode}-${eventId}`，而 severity 由 ruleCode 唯一决定
   * （见 risk/engine.ts），因此「同 id ⇒ 同 severity」。若将来某条规则改成按金额等
   * 动态定级，仅按 id 去重会漏推「升级为 high」的情况，届时需改为按 id+severity 去重。
   */
  readonly knownFindingIds: readonly string[];
}

export function buildRiskAlertNotification(input: RiskAlertInput): NotificationRequest | null {
  const known = new Set(input.knownFindingIds);
  const fresh = input.findings.filter((item) => item.severity === "high" && !known.has(item.id));
  if (fresh.length === 0) {
    return null;
  }
  const first = fresh[0]!;
  const listed = fresh.slice(0, MAX_DETAIL_LINES).map((item) => `· ${item.title}`);
  const more = fresh.length > MAX_DETAIL_LINES ? [`· 另有 ${fresh.length - MAX_DETAIL_LINES} 项…`] : [];
  return {
    kind: "risk_alert",
    companyId: input.companyId,
    title: `发现 ${fresh.length} 项高风险：${input.eventLabel}`,
    body: [...listed, ...more].join("\n"),
    deepLink: {
      type: "risk_finding",
      findingId: first.id,
      businessEventId: first.businessEventId
    } satisfies DeepLinkEvent
  };
}

export interface VoucherApprovalInput {
  readonly companyId: string;
  readonly voucherId: string;
  readonly summary: string;
  readonly submittedBy: string;
  readonly businessEventId: string | null;
}

export function buildVoucherApprovalNotification(input: VoucherApprovalInput): NotificationRequest {
  return {
    kind: "approval_request",
    companyId: input.companyId,
    title: "有一张凭证待复核",
    body: `${input.submittedBy} 提交了「${input.summary}」，请复核后过账。`,
    deepLink: { type: "voucher_review", businessEventId: input.businessEventId }
  };
}

export interface CloseDraftsInput {
  readonly companyId: string;
  readonly period: string;
  readonly generated: number;
}

export function buildCloseDraftsNotification(input: CloseDraftsInput): NotificationRequest | null {
  if (input.generated <= 0) {
    return null;
  }
  return {
    kind: "approval_request",
    companyId: input.companyId,
    title: `${input.generated} 张 AI 记账草稿待审批`,
    body: `${input.period} 结账已生成 ${input.generated} 张草稿凭证，请在「我的一天」中逐张确认。`,
    deepLink: { type: "draft_queue" }
  };
}

export interface OverdueTasksInput {
  readonly companyId: string;
  readonly overdue: number;
}

export function buildOverdueTasksNotification(input: OverdueTasksInput): NotificationRequest | null {
  if (input.overdue <= 0) {
    return null;
  }
  return {
    kind: "task_overdue",
    companyId: input.companyId,
    title: `有 ${input.overdue} 项任务已逾期`,
    body: "请尽快处理，避免影响结账与申报进度。",
    deepLink: { type: "overdue_tasks" }
  };
}
