/**
 * 申请单的状态机（V13-B1）。
 *
 * ## 申请单是独立单据，不是业务事项的一个 type
 *
 * 业务事项是「**已经发生**的经营事实」，申请单是「**尚未发生**的意图」。
 * 可编辑性完全不同：事项过账后不该改，申请单在批准前随时可改、被驳回后
 * 还要改了再提。合成一张表，「这条能不能改」就得靠 type 分支判断——
 * 而那种判断迟早漏一处。
 *
 * 两者的关系是**审批通过后派生一条事项**（B2）：意图兑现成事实。
 *
 * ## 状态与预算占用的对应
 *
 * ```
 * draft ──submit──> pending ──approve──> approved ──complete──> completed
 *   ▲                  │                    │
 *   │                  ├──reject──> rejected ──submit──┐
 *   │                  │                               │
 *   └───────────────── └──cancel──> cancelled <─cancel─┘
 * ```
 *
 * - `approve` 时**占用**预算（钱没花但不能给别人用）
 * - `complete` 时占用**转实际**（报销落账了）
 * - `cancel` / `reject` 时**释放**占用
 *
 * 接线在 store 层，这里只管状态本身。
 */

export const REQUEST_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "completed",
  "cancelled"
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type RequestAction = "submit" | "approve" | "reject" | "cancel" | "complete";

/**
 * 状态转移表。
 *
 * 写成数据而不是 if 分支：加状态时能一眼看出哪些格子是空的，
 * 而散在 if 里的规则要读完整个函数才知道覆盖了没有。
 */
const TRANSITIONS: Record<RequestStatus, Partial<Record<RequestAction, RequestStatus>>> = {
  draft: { submit: "pending", cancel: "cancelled" },
  // 审批中不能直接 complete：跳过 approved 会让预算占用永远转不成实际——
  // 占用是在 approve 那一步建立的。
  pending: { approve: "approved", reject: "rejected", cancel: "cancelled" },
  approved: { complete: "completed", cancel: "cancelled" },
  // 驳回不是终点：做成终点会逼用户为同一件事重开一张单，
  // 而那让「这件事申请过几次」变成一堆看不出关联的记录。
  rejected: { submit: "pending", cancel: "cancelled" },
  completed: {},
  cancelled: {}
};

export function canTransition(status: RequestStatus, action: RequestAction): boolean {
  return TRANSITIONS[status][action] !== undefined;
}

/**
 * 执行一次转移。
 *
 * 非法转移**抛错**而不是返回原状态：静默返回会让调用方以为操作成功了，
 * 而单据一动没动——用户看到「提交成功」的提示，回头发现单子还在草稿箱。
 */
export function nextStatus(status: RequestStatus, action: RequestAction): RequestStatus {
  const next = TRANSITIONS[status][action];
  if (next === undefined) {
    throw new Error(`申请单当前是「${status}」，不允许执行「${action}」`);
  }
  return next;
}

/**
 * 能否编辑内容（金额、事由、科目等）。
 *
 * 审批中还能改金额，等于审批人批的和最终生效的不是一个东西。
 */
export function canEdit(status: RequestStatus): boolean {
  return status === "draft" || status === "rejected";
}

/** 申请类型。与费用标准的 `expenseType` 是两个维度，不要混用。 */
export const REQUEST_TYPES = ["travel", "procurement", "payment", "other"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  travel: "出差申请",
  procurement: "采购申请",
  payment: "用款申请",
  other: "其他申请"
};
