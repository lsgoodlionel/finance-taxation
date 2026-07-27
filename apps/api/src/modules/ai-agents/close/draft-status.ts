/**
 * event_voucher_drafts.status 的「待批准」规范语义（V8-B 任务 1）。
 *
 * 同一张表有两个生产者，历史上写入了两种不同的待决状态：
 * - 事项分析规则引擎（modules/events/*-rules.ts）：缺票据时写 'draft'，
 *   资料齐备待人工复核时写 'review_required'；
 * - Stage H 月结（ai-agents/close/close-drafts.routes.ts）：一律写 'draft'。
 *
 * 而消费侧（inbox / home 的草稿队列、approve/reject）此前只认 'draft'，
 * 导致经过 analyzeEvent 的事项草稿（'review_required'）既看不到也批不了，
 * 且 generate 因幂等跳过而永远补不出可批准的草稿——闭环断裂。
 *
 * 这里把「待批准」收敛为唯一的规范定义，供列表、审批、月结向导共用，
 * 避免 'draft' / 'review_required' 两个魔法字符串继续散落各处。
 */

/** 待批准（尚未落定）的草稿状态集合。 */
export const PENDING_DRAFT_STATUSES = ["draft", "review_required"] as const;

export type PendingDraftStatus = (typeof PENDING_DRAFT_STATUSES)[number];

/** 列表接口用于表达「两种待批状态的并集」的查询别名。 */
export const PENDING_STATUS_FILTER = "pending";

/** 该状态是否仍待人工批准（可 approve / reject）。 */
export function isPendingDraftStatus(status: string): status is PendingDraftStatus {
  return (PENDING_DRAFT_STATUSES as readonly string[]).includes(status);
}

/** 已落定状态的中文标签，用于「草稿已批准/已驳回，不可重复处理」提示。 */
export function decidedStatusLabel(status: string): string {
  return status === "approved" ? "批准" : "驳回";
}
