/**
 * /audit 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页把 6 个平级区块一次摊开：页头卡（标题 + 命中数 + 当前上下文 +
 * 「AI 审计勾稽」按钮）、「校验完整性」一行、全站 10 环节导航条、四项过滤条、
 * 日志表、右侧详情面板。
 *
 * 问题不在于块多，而在于这 6 块混了两件性质完全不同的事：
 * - 「查一查谁改了什么」是检索工作台：筛条件 → 翻列表 → 看某条的变更明细，
 *   一路都在跟日志行打交道；
 * - 「验一验日志本身可不可信」不看任何一行日志：按一下出一个结论（hash 链是否
 *   连续 / AI 勾稽有没有异常）。它今天被挤成页头里的一个按钮和一个小标签——
 *   而「审计链在第 37 条断裂」是这套系统能给出的最严重的结论之一。
 *
 * 所以按性质归成两件事，TaskFocusShell 一次只渲染一件事的工作区。
 *
 * 为什么不按「追一个对象」/「按期间通查」再拆一刀：那两者用的是同一批过滤条件，
 * 拆开就得把「对象类型 + 编号」和「日期区间」分到两个工作区里，用户想「查这份
 * 合同上个月的改动」时反而没地方填——拆任务不能拆掉能力。真正的差别（在追一个
 * 具体对象时额外给出它走过的步骤）由工作区内部按有没有 resourceId 自己判断，
 * 见 audit-object-flow.ts。
 */
import type { TaskDef } from "../../lib/task-focus";

export const AUDIT_TASK_KEYS = {
  trail: "trail",
  integrity: "integrity"
} as const;

export type AuditTaskKey = (typeof AUDIT_TASK_KEYS)[keyof typeof AUDIT_TASK_KEYS];

/** V10 起在 URL 上承载「当前在做哪件事」的参数名（与 /tax、/ledger、/knowledge 对齐）。 */
export const AUDIT_TASK_QUERY_KEY = "task";

export const DEFAULT_AUDIT_TASK: AuditTaskKey = AUDIT_TASK_KEYS.trail;

export function isAuditTaskKey(value: unknown): value is AuditTaskKey {
  return typeof value === "string" && value in AUDIT_TASK_KEYS;
}

/** 从 URL 解析当前任务；参数缺失或不合法时回落到「查操作痕迹」。 */
export function readAuditTask(params: URLSearchParams): AuditTaskKey {
  const raw = params.get(AUDIT_TASK_QUERY_KEY);
  return isAuditTaskKey(raw) ? raw : DEFAULT_AUDIT_TASK;
}

/**
 * 写入当前任务，其余查询参数（对象类型、编号、日期区间、翻页位置、选中行）
 * 原样保留 —— 切到「验完整性」再切回来，用户刚才筛好的条件不能丢。
 */
export function writeAuditTask(params: URLSearchParams, task: AuditTaskKey): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(AUDIT_TASK_QUERY_KEY, task);
  return next;
}

const AUDIT_TASK_TEXT: Record<AuditTaskKey, { label: string; description: string }> = {
  trail: {
    label: "查谁改了什么",
    description:
      "按对象类型、对象编号和日期区间检索操作痕迹：谁、什么时候、把哪个字段从什么改成了什么，并可回跳到业务单据本身。"
  },
  integrity: {
    label: "验日志有没有被动过",
    description:
      "不看具体某一行：校验审计链是否首尾相连（有人事后改过或删过记录，链就会在那一条断开），并可让 AI 通查一遍账务勾稽。"
  }
};

export interface AuditTaskInput {
  /**
   * 审计链是否已校验出断裂。断裂是需要立刻处理的事故，挂角标让它自己冒出来；
   * 未校验（null）与校验通过都不挂 —— 「还没验」不是待办量，挂个 1 是制造假紧迫感。
   */
  chainBroken: boolean;
}

export function buildAuditTasks({ chainBroken }: AuditTaskInput): TaskDef[] {
  return [
    { key: AUDIT_TASK_KEYS.trail, ...AUDIT_TASK_TEXT.trail },
    {
      key: AUDIT_TASK_KEYS.integrity,
      ...AUDIT_TASK_TEXT.integrity,
      ...(chainBroken ? { badge: 1 } : {})
    }
  ];
}
