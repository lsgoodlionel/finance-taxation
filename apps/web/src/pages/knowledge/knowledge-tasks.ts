/**
 * /knowledge 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页把 7 个平级区块一次摊开：页头（含「从文件导入」和「+ 新增条目」
 * 两个按钮）、概览统计、筛选条、解析结果面板、录入表单、条目列表、右侧说明。
 * 「上传制度文件让 AI 解析」「手工录入一条」「翻查已有条目」是三件互不相干的事，
 * 却同屏抢位置：用户在填表单时，下方还压着一整列条目卡片；在翻条目时，
 * 上方还挂着一个空表单的入口和一块解析面板。
 *
 * 现在按「一次只做一件事」归口成三件事，TaskFocusShell 一次只渲染一件事的工作区，
 * 概览统计与「AI 引用说明」收缩成随任务变化的 aside。选中的任务写进 URL（?task=），
 * 可刷新、可分享、可前进后退 —— 与 /tax、/ledger、/risk 同一套约定。
 */
import type { TaskDef } from "../../lib/task-focus";
import type { FileParseState } from "./types";

export const KNOWLEDGE_TASK_KEYS = {
  browse: "browse",
  create: "create",
  import: "import"
} as const;

export type KnowledgeTaskKey = (typeof KNOWLEDGE_TASK_KEYS)[keyof typeof KNOWLEDGE_TASK_KEYS];

/** V10 起在 URL 上承载「当前在做哪件事」的参数名（与 /tax、/ledger、/risk 对齐）。 */
export const KNOWLEDGE_TASK_QUERY_KEY = "task";

export const DEFAULT_KNOWLEDGE_TASK: KnowledgeTaskKey = KNOWLEDGE_TASK_KEYS.browse;

export function isKnowledgeTaskKey(value: unknown): value is KnowledgeTaskKey {
  return typeof value === "string" && value in KNOWLEDGE_TASK_KEYS;
}

/** 从 URL 解析当前任务；参数缺失或不合法时回落到「查阅条目」。 */
export function readKnowledgeTask(params: URLSearchParams): KnowledgeTaskKey {
  const raw = params.get(KNOWLEDGE_TASK_QUERY_KEY);
  return isKnowledgeTaskKey(raw) ? raw : DEFAULT_KNOWLEDGE_TASK;
}

/** 写入当前任务，其余查询参数（分类、关键词等）原样保留。 */
export function writeKnowledgeTask(params: URLSearchParams, task: KnowledgeTaskKey): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(KNOWLEDGE_TASK_QUERY_KEY, task);
  return next;
}

/**
 * 「从文件导入」这件事真实的待办量：已解析成功、但还没落库的文件数。
 *
 * 不拿「上传了几个文件」充数：解析失败的那几个用户只能重传，不算待办；
 * 正在解析的还没轮到用户做决定。角标存在的意义就是可信。
 */
export function countPendingParsedItems(parseStates: readonly FileParseState[]): number {
  return parseStates.filter((state) => state.status === "done" && Boolean(state.result)).length;
}

/** 任务名用动词短语，说清「在这里做什么」，而不是罗列这个视图叫什么。 */
const KNOWLEDGE_TASK_TEXT: Record<KnowledgeTaskKey, { label: string; description: string }> = {
  browse: {
    label: "查阅已有条目",
    description: "按分类或关键词找到一条制度，展开看全文，并决定它是否继续参与 AI 检索。"
  },
  create: {
    label: "手工录入一条",
    description: "自己敲一条制度或常见问答；从列表点「编辑」进来时，这里装的是那一条的原文。"
  },
  import: {
    label: "从文件导入制度",
    description: "上传 PDF 或 Word，让 AI 读出标题、分类、摘要和标签，逐条确认后再入库。"
  }
};

export interface KnowledgeTaskInput {
  /** 本次上传的解析状态，用于「还有几条等着入库」的角标。 */
  parseStates: readonly FileParseState[];
}

/**
 * 构造任务列表。
 *
 * 只有「从文件导入」挂角标：条目总数不是待办（库里有 300 条制度不代表有 300 件事要办），
 * 挂上去只会制造假紧迫感。顺序固定按「查 → 录 → 导」排，不按角标排序：
 * 位置一变，用户的肌肉记忆就废了。
 */
export function buildKnowledgeTasks({ parseStates }: KnowledgeTaskInput): TaskDef[] {
  const pending = countPendingParsedItems(parseStates);
  return [
    { key: KNOWLEDGE_TASK_KEYS.browse, ...KNOWLEDGE_TASK_TEXT.browse },
    { key: KNOWLEDGE_TASK_KEYS.create, ...KNOWLEDGE_TASK_TEXT.create },
    {
      key: KNOWLEDGE_TASK_KEYS.import,
      ...KNOWLEDGE_TASK_TEXT.import,
      ...(pending > 0 ? { badge: pending } : {})
    }
  ];
}
