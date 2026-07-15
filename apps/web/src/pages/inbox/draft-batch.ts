/**
 * 收件箱 · AI 草稿批量复核纯逻辑
 * 供 InboxAiDraftsCard / InboxDraftBatchBar 复用：
 * 同类分组（凭证类型 + 科目组合）、金额合计、顺序批量执行（单条失败不中断）、失败汇总。
 */
import type { CloseDraft, CloseDraftLine } from "../../lib/api";

/** 借贷平衡判定容差（元）：后端金额为两位小数字符串，容忍浮点误差。 */
const BALANCE_TOLERANCE_YUAN = 0.005;

/** 后端把金额序列化为「元」字符串（如 "1000.00"）；防御性转数字，非法值按 0 处理。 */
export function toAmount(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 金额展示：¥1,234.50 */
export function formatCny(amount: number): string {
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface DraftTotals {
  debit: number;
  credit: number;
  isBalanced: boolean;
}

/** 计算一条草稿的借/贷合计与平衡校验（借=贷 ✓）。 */
export function computeDraftTotals(lines: readonly CloseDraftLine[]): DraftTotals {
  const debit = lines.reduce((sum, line) => sum + toAmount(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + toAmount(line.credit), 0);
  return { debit, credit, isBalanced: Math.abs(debit - credit) < BALANCE_TOLERANCE_YUAN };
}

/**
 * 同类分组键：凭证类型 + 排序去重后的科目代码组合。
 * CloseDraft 无 templateKey 字段，voucherType + 科目对是可用的最稳定分组维度。
 */
export function getDraftGroupKey(draft: Pick<CloseDraft, "voucherType" | "lines">): string {
  const codes = Array.from(new Set(draft.lines.map((line) => line.accountCode))).sort();
  return `${draft.voucherType}|${codes.join("+")}`;
}

export interface DraftGroup {
  key: string;
  /** 展示用标签：凭证类型 · 科目代码组合 */
  label: string;
  ids: string[];
}

/** 按同类（凭证类型 + 科目组合）分组，保持首次出现顺序。 */
export function groupDrafts(drafts: readonly CloseDraft[]): DraftGroup[] {
  const groups = new Map<string, DraftGroup>();
  for (const draft of drafts) {
    const key = getDraftGroupKey(draft);
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, { ...existing, ids: [...existing.ids, draft.id] });
      continue;
    }
    const codes = Array.from(new Set(draft.lines.map((line) => line.accountCode))).sort();
    groups.set(key, {
      key,
      label: `${draft.voucherType} · ${codes.length > 0 ? codes.join("/") : "无科目"}`,
      ids: [draft.id],
    });
  }
  return Array.from(groups.values());
}

/** 已选草稿金额合计（取每条草稿的借方合计）。 */
export function sumSelectedAmount(
  drafts: readonly CloseDraft[],
  selectedIds: ReadonlySet<string>
): number {
  return drafts
    .filter((draft) => selectedIds.has(draft.id))
    .reduce((sum, draft) => sum + computeDraftTotals(draft.lines).debit, 0);
}

/** 不可变勾选切换：返回新 Set。 */
export function toggleId(selectedIds: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** 不可变并集：把一组 id 合入已选集合，返回新 Set。 */
export function unionIds(selectedIds: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selectedIds);
  for (const id of ids) next.add(id);
  return next;
}

/** 保留仍存在的勾选项（列表刷新后清理悬空 id）；无变化时返回原集合以避免多余渲染。 */
export function pruneIds(
  selectedIds: ReadonlySet<string>,
  aliveIds: ReadonlySet<string>
): ReadonlySet<string> {
  const next = new Set(Array.from(selectedIds).filter((id) => aliveIds.has(id)));
  return next.size === selectedIds.size ? selectedIds : next;
}

export interface BatchTarget {
  id: string;
  summary: string;
}

export interface BatchFailure {
  id: string;
  summary: string;
  message: string;
}

export interface BatchResult {
  succeeded: string[];
  failed: BatchFailure[];
}

function toFailureMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "未知错误";
}

/**
 * 顺序批量执行：逐条调用 action，单条失败不中断，
 * 每完成一条回调 onProgress(done, total)，最终归约出成功/失败清单。
 */
export async function runSequentialBatch(
  targets: readonly BatchTarget[],
  action: (id: string) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void
): Promise<BatchResult> {
  const total = targets.length;
  let result: BatchResult = { succeeded: [], failed: [] };
  for (const [index, target] of targets.entries()) {
    try {
      await action(target.id);
      result = { ...result, succeeded: [...result.succeeded, target.id] };
    } catch (err) {
      result = {
        ...result,
        failed: [...result.failed, { id: target.id, summary: target.summary, message: toFailureMessage(err) }],
      };
    }
    onProgress?.(index + 1, total);
  }
  return result;
}

/** 失败汇总文案：成功 M 条，失败 K 条。 */
export function summarizeBatchResult(actionLabel: string, result: BatchResult): string {
  const base = `批量${actionLabel}完成：成功 ${result.succeeded.length} 条`;
  return result.failed.length > 0 ? `${base}，失败 ${result.failed.length} 条` : base;
}
