/**
 * K1 老板工作台 · 纯逻辑工具
 * runway 估算、待办卡优先级排序、红绿灯 tone 映射，全部无副作用，便于单测。
 */
import type { CashForecast, CloseDraft, InboxItem } from "../../lib/api";

// ── 红绿灯 tone ──────────────────────────────────────────────────────────────

export type TrafficTone = "good" | "warn" | "bad" | "neutral";

export const TONE_COLORS: Record<TrafficTone, string> = {
  good: "#16a34a",
  warn: "#d97706",
  bad: "#dc2626",
  neutral: "#64748b"
};

/** 风险数红绿灯：0 → 绿；1-2 → 黄；≥3 → 红。 */
export function riskTone(riskCount: number): TrafficTone {
  if (riskCount <= 0) return "good";
  if (riskCount <= 2) return "warn";
  return "bad";
}

// ── 现金 runway 估算 ─────────────────────────────────────────────────────────

const RUNWAY_GOOD_MONTHS = 6;
const RUNWAY_WARN_MONTHS = 3;

export type RunwayEstimate =
  | { kind: "unknown" }
  | { kind: "ample" }
  | { kind: "months"; months: number };

/**
 * 口径：以当期现金流预测为月度代理——
 * 月净流出 = 预计流出 - 预计流入；净流出 ≤ 0 视为「进的比出的多」（ample）；
 * 否则 runway = 现金余额 ÷ 月净流出（保留 1 位小数）。数据缺失 → unknown。
 */
export function estimateCashRunway(forecast: CashForecast | null | undefined): RunwayEstimate {
  if (!forecast) return { kind: "unknown" };
  const { cashBalance, expectedInflow, expectedOutflow } = forecast;
  if (![cashBalance, expectedInflow, expectedOutflow].every(Number.isFinite)) {
    return { kind: "unknown" };
  }
  const monthlyNetOutflow = expectedOutflow - expectedInflow;
  if (monthlyNetOutflow <= 0) return { kind: "ample" };
  if (cashBalance <= 0) return { kind: "months", months: 0 };
  const months = Math.round((cashBalance / monthlyNetOutflow) * 10) / 10;
  return { kind: "months", months };
}

export function runwayTone(estimate: RunwayEstimate): TrafficTone {
  if (estimate.kind === "unknown") return "neutral";
  if (estimate.kind === "ample") return "good";
  if (estimate.months >= RUNWAY_GOOD_MONTHS) return "good";
  if (estimate.months >= RUNWAY_WARN_MONTHS) return "warn";
  return "bad";
}

/** 把 runway 估算翻译成白话大数字 + 辅助说明。 */
export function describeRunway(estimate: RunwayEstimate): { value: string; note: string } {
  if (estimate.kind === "unknown") {
    return { value: "暂无法估算", note: "还没有足够的现金流数据，先让财务录几笔账" };
  }
  if (estimate.kind === "ample") {
    return { value: "现金充足", note: "最近进账比花销多，不用担心现金" };
  }
  if (estimate.months <= 0) {
    return { value: "0 个月", note: "账上现金已很紧张，建议马上和财务确认" };
  }
  return { value: `约 ${estimate.months} 个月`, note: "按最近的收支节奏，账上的钱还能撑这么久" };
}

// ── 待办卡优先级 ─────────────────────────────────────────────────────────────

export const MAX_PENDING_CARDS = 3;

/** 优先级：高危提醒（inbox warning）> AI 草稿待确认 > 一般提醒。 */
const PRIORITY_RISK = 0;
const PRIORITY_AI_DRAFT = 1;
const PRIORITY_INFO = 2;

export interface PendingCardModel {
  key: string;
  kind: "ai-draft" | "inbox";
  priority: number;
  title: string;
  impact: string;
  amount: number | null;
  detailPath: string;
  /** 仅 AI 草稿卡携带，用于批准/驳回。 */
  draftId?: string;
}

/** 草稿金额 = 借方合计（后端序列化为「元」字符串，防御性转数字）。 */
export function sumDraftAmount(draft: Pick<CloseDraft, "lines">): number | null {
  const total = draft.lines.reduce((acc, line) => {
    const n = Number(line.debit);
    return Number.isFinite(n) && n > 0 ? acc + n : acc;
  }, 0);
  return total > 0 ? total : null;
}

function formatCny(amount: number): string {
  return amount.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function draftCard(draft: CloseDraft): PendingCardModel {
  const amount = sumDraftAmount(draft);
  const title = amount !== null
    ? `AI 起草了一张 ${formatCny(amount)} 元的记账凭证，等您确认`
    : "AI 起草了一张记账凭证，等您确认";
  return {
    key: `draft-${draft.id}`,
    kind: "ai-draft",
    priority: PRIORITY_AI_DRAFT,
    title,
    impact: `事由：${draft.summary}。确认后交财务复核入账，不会直接改动账本。`,
    amount,
    detailPath: "/inbox",
    draftId: draft.id
  };
}

function inboxCard(item: InboxItem): PendingCardModel {
  return {
    key: `inbox-${item.key}`,
    kind: "inbox",
    priority: item.tone === "warning" ? PRIORITY_RISK : PRIORITY_INFO,
    title: `${item.label}：有 ${item.count} 件等您过目`,
    impact: item.hint,
    amount: null,
    detailPath: item.actionPath
  };
}

/**
 * 汇总 AI 草稿 + 统一收件箱为白话待办卡，按优先级稳定排序。
 * 收件箱只保留 count > 0 的分类卡。
 */
export function buildPendingCards(
  drafts: readonly CloseDraft[],
  inboxItems: readonly InboxItem[]
): PendingCardModel[] {
  const cards = [
    ...inboxItems.filter((item) => item.count > 0).map(inboxCard),
    ...drafts.map(draftCard)
  ];
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => a.card.priority - b.card.priority || a.index - b.index)
    .map(({ card }) => card);
}

/** 取前 N 张，其余数量用于「还有 N 件 →」。 */
export function takeTopPending(
  cards: readonly PendingCardModel[],
  max = MAX_PENDING_CARDS
): { top: PendingCardModel[]; remaining: number } {
  return { top: cards.slice(0, max), remaining: Math.max(0, cards.length - max) };
}

// ── KPI 白话映射 ─────────────────────────────────────────────────────────────

/** 「本月赚了多少」tone：净利率 ≥10% 绿、0-10% 黄、为负红；解析失败 neutral。 */
export function profitTone(netProfit: string, netMargin: string): TrafficTone {
  const profit = Number(netProfit.replace(/,/g, ""));
  if (!Number.isFinite(profit)) return "neutral";
  if (profit < 0) return "bad";
  const margin = Number.parseFloat(netMargin);
  if (Number.isFinite(margin) && margin >= 10) return "good";
  return profit > 0 ? "good" : "warn";
}
