/**
 * V7 Stage K · K2「记一笔」极简录入向导 —— 共享类型。
 * 面向非财务人员的唯一录入入口：3 步封顶，全程不见科目与借贷。
 */

/** 向导三步：说清楚 → 确认 → 完成 */
export type QuickEntryStepKey = "describe" | "confirm" | "done";

/** 第 1 步的两种输入方式 */
export type QuickInputMode = "upload" | "text";

/** 白话草稿：沿用 events 6 字段模型，但字段命名与标签全部白话化 */
export interface QuickDraft {
  /** 事项类型（沿用 events 类型枚举 key，如 expense / procurement） */
  type: string;
  /** 金额（字符串，保留用户原始输入；空串表示未填） */
  amount: string;
  /** 发生日期 YYYY-MM-DD；空串表示未填 */
  occurredOn: string;
  /** 对方单位（可空） */
  counterparty: string;
  /** 部门（可选，默认「综合」） */
  department: string;
  /** 原始白话描述或票据识别摘要 */
  note: string;
}

/** 白话/OCR 解析结果：null 表示该字段没解析出来 */
export interface ParsedFields {
  type: string | null;
  amount: string | null;
  occurredOn: string | null;
  counterparty: string | null;
}

/** 解析来源：ai = 走通了后端 AI/OCR；local = 仅前端正则；manual = 用户手填 */
export type ParseSource = "ai" | "local" | "manual";

/** 第 3 步落库结果（完成页展示用） */
export interface QuickEntryResult {
  eventId: string;
  taskCount: number;
  missingInvoice: boolean;
  uploadWarning: string | null;
}

/**
 * 向导控制器：useQuickEntry 的返回契约。
 * 单独定义接口是为了让步骤组件只依赖类型、不依赖 hook（hook 依赖 lib/api，
 * 而 lib/api 顶层读取 import.meta.env，在 node 测试环境不可加载）。
 */
export interface QuickEntryController {
  step: QuickEntryStepKey;
  mode: QuickInputMode;
  setMode: (mode: QuickInputMode) => void;
  textInput: string;
  setTextInput: (value: string) => void;
  receiptFile: File | null;
  parsing: boolean;
  parseError: string | null;
  parseSource: ParseSource | null;
  draft: QuickDraft;
  updateDraft: (patch: Partial<QuickDraft>) => void;
  missingItems: string[];
  hasAttachment: boolean;
  submitting: boolean;
  submitError: string | null;
  result: QuickEntryResult | null;
  analyzeReceipt: (file: File) => Promise<void>;
  analyzeText: () => Promise<void>;
  skipToManualConfirm: () => void;
  removeReceiptFile: () => void;
  goBackToDescribe: () => void;
  submit: () => Promise<void>;
  reset: () => void;
}
