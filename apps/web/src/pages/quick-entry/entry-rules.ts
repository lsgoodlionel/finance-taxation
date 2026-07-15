/**
 * 「记一笔」业务规则（纯逻辑）：
 * 类型白话字典 / 缺件（缺发票）判断 / 白话摘要 / 事项落库 payload 组装。
 */
import type { ParsedFields, QuickDraft } from "./types";

export const DEFAULT_DEPARTMENT = "综合";

/** 事项类型 → 白话选项（value 沿用 events 类型枚举 key） */
export const QUICK_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "expense", label: "日常花销（吃饭 / 招待 / 办公 / 房租水电）" },
  { value: "travel_expense", label: "出差花销（车票 / 机票 / 酒店 / 打车）" },
  { value: "procurement", label: "买东西 / 采购" },
  { value: "purchase_expense", label: "采购报销" },
  { value: "sales", label: "卖东西收到钱" },
  { value: "contract_revenue", label: "合同回款 / 合同收入" },
  { value: "payroll", label: "发工资 / 奖金" },
  { value: "asset", label: "买设备 / 大件资产" },
  { value: "financing", label: "借钱 / 融资" },
  { value: "rnd", label: "研发投入" },
  { value: "tax", label: "交税相关" },
  { value: "general", label: "其他 / 说不清" }
];

const TYPE_PLAIN_LABELS: Record<string, string> = Object.fromEntries(
  QUICK_TYPE_OPTIONS.map((option) => [option.value, option.label.split("（")[0] ?? option.label])
);

/** 类型白话名（如 expense → 日常花销）；未知类型原样返回。 */
export function getTypePlainLabel(type: string): string {
  return TYPE_PLAIN_LABELS[type] ?? type;
}

/** 花钱类事项需要发票才能税前扣除 */
const INVOICE_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  "expense",
  "travel_expense",
  "procurement",
  "purchase_expense"
]);

/** 缺件判断：花钱类事项且没有票据附件 → 需要提醒补发票。 */
export function isInvoiceMissing(type: string, hasAttachment: boolean): boolean {
  return INVOICE_REQUIRED_TYPES.has(type) && !hasAttachment;
}

export const MISSING_INVOICE_HINT =
  "这类支出需要发票才能税前扣除。现在没有也能先记下，稍后我们会提醒您补传。";

/** 缺件提醒列表（当前仅发票一种，返回数组便于将来扩展）。 */
export function buildMissingItems(type: string, hasAttachment: boolean): string[] {
  return isInvoiceMissing(type, hasAttachment) ? [MISSING_INVOICE_HINT] : [];
}

function formatAmountText(amount: string): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 白话摘要：「{类型白话名} {金额} 元，{日期}，对方：{单位}」 */
export function buildSummaryText(draft: QuickDraft): string {
  const parts = [`${getTypePlainLabel(draft.type)} ${formatAmountText(draft.amount)} 元`];
  if (draft.occurredOn) parts.push(draft.occurredOn);
  if (draft.counterparty) parts.push(`对方：${draft.counterparty}`);
  return parts.join("，");
}

const TITLE_NOTE_MAX_LENGTH = 18;

/** 事项标题：优先「类型 + 对方」，否则截取白话描述开头。 */
export function buildEventTitle(draft: QuickDraft): string {
  const plainType = getTypePlainLabel(draft.type);
  if (draft.counterparty) {
    return `${plainType} · ${draft.counterparty}`;
  }
  const note = draft.note.trim().replace(/\s+/g, " ");
  if (note) {
    return note.length > TITLE_NOTE_MAX_LENGTH ? `${note.slice(0, TITLE_NOTE_MAX_LENGTH)}…` : note;
  }
  return `${plainType} ${formatAmountText(draft.amount)} 元`;
}

export const MISSING_INVOICE_MARKER = "【待补发票】";

export interface QuickEventPayload {
  type: string;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string | null;
  currency: string;
  source: string;
}

/** 组装 createEvent 入参：描述 = 原话 + 对方单位 + 缺发票标注。 */
export function buildEventPayload(draft: QuickDraft, hasAttachment: boolean): QuickEventPayload {
  const lines = [draft.note.trim() || buildSummaryText(draft)];
  if (draft.counterparty) {
    lines.push(`对方单位：${draft.counterparty}`);
  }
  lines.push("来源：记一笔（极简录入）");
  if (isInvoiceMissing(draft.type, hasAttachment)) {
    lines.push(`${MISSING_INVOICE_MARKER}该支出尚未提供发票，需补传发票后才能税前扣除。`);
  }
  return {
    type: draft.type,
    title: buildEventTitle(draft),
    description: lines.join("\n"),
    department: draft.department.trim() || DEFAULT_DEPARTMENT,
    occurredOn: draft.occurredOn,
    amount: draft.amount.trim() ? draft.amount.trim() : null,
    currency: "CNY",
    source: "manual"
  };
}

/** 确认页放行条件：类型 + 合法日期 + 大于 0 的金额。 */
export function isDraftReadyForSubmit(draft: QuickDraft): boolean {
  if (!draft.type) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn)) return false;
  const amount = Number.parseFloat(draft.amount);
  return Number.isFinite(amount) && amount > 0;
}

/** 用解析结果补全草稿（不覆盖用户已填内容，返回新对象）。 */
export function applyParsedToDraft(draft: QuickDraft, parsed: ParsedFields): QuickDraft {
  return {
    ...draft,
    type: draft.type || (parsed.type ?? ""),
    amount: draft.amount || (parsed.amount ?? ""),
    occurredOn: draft.occurredOn || (parsed.occurredOn ?? ""),
    counterparty: draft.counterparty || (parsed.counterparty ?? "")
  };
}

/** 从事项详情的单据列表里挑票据附件的挂载目标：优先发票类，其次待上传，最后第一份。 */
export function pickAttachmentTargetDocument<
  T extends { id: string; documentType: string; status: string }
>(documents: readonly T[]): T | null {
  if (documents.length === 0) return null;
  const invoiceLike = documents.find((doc) => doc.documentType.includes("invoice"));
  if (invoiceLike) return invoiceLike;
  const awaiting = documents.find(
    (doc) => doc.status === "awaiting_upload" || doc.status === "required"
  );
  return awaiting ?? documents[0] ?? null;
}
