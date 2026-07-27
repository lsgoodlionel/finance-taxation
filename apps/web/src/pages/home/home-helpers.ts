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
 * 口径：以当期现金流预测为月度代理。判断顺序按「先证伪、后下结论」排列——
 * 1) 数据缺失/非数字 → unknown；
 * 2) 预计流入与流出都为 0（新公司还没有任何收支记录）→ unknown，
 *    绝不能因为「0 - 0 ≤ 0」就报「进账比花销多」的绿灯；
 * 3) 现金余额 ≤ 0 → 0 个月（红灯），此时无论收支如何都不允许说「现金充足」；
 * 4) 确有收支数据且月净流出 ≤ 0 → ample（真的进的比出的多）；
 * 5) 否则 runway = 现金余额 ÷ 月净流出（保留 1 位小数）。
 */
export function estimateCashRunway(forecast: CashForecast | null | undefined): RunwayEstimate {
  if (!forecast) return { kind: "unknown" };
  const { cashBalance, expectedInflow, expectedOutflow } = forecast;
  if (![cashBalance, expectedInflow, expectedOutflow].every(Number.isFinite)) {
    return { kind: "unknown" };
  }
  const hasFlowData = expectedInflow !== 0 || expectedOutflow !== 0;
  if (!hasFlowData) return { kind: "unknown" };
  if (cashBalance <= 0) return { kind: "months", months: 0 };
  const monthlyNetOutflow = expectedOutflow - expectedInflow;
  if (monthlyNetOutflow <= 0) return { kind: "ample" };
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

/** 把 runway 估算翻译成白话大数字 + 辅助说明（文案必须与真实数据一致，不许替系统吹牛）。 */
export function describeRunway(estimate: RunwayEstimate): { value: string; note: string } {
  if (estimate.kind === "unknown") {
    return { value: "还看不出来", note: "这个月还没有收支记录，暂时估不出能撑多久" };
  }
  if (estimate.kind === "ample") {
    return { value: "现金充足", note: "这个月进账比花销多，账上的钱没有被消耗" };
  }
  if (estimate.months <= 0) {
    return { value: "0 个月", note: "账上现金已很紧张，建议马上和财务确认" };
  }
  return { value: `约 ${estimate.months} 个月`, note: "按最近的收支节奏，账上的钱还能撑这么久" };
}

// ── 金额白话格式化 ───────────────────────────────────────────────────────────

const WAN = 10000;
/** ≥10 万改用「万」表述：老板一眼看得懂，避免 ¥-183000 这种裸数字。 */
export const WAN_DISPLAY_THRESHOLD = 100000;

/**
 * 老板视角金额：≥10 万用「万」（最多 1 位小数），否则千分位保留 2 位小数；
 * 负数把负号提到 ¥ 之前（-¥18.3 万）。无法解析（null / 空串 / "—" / NaN）返回 null，
 * 由调用方给降级文案，绝不把解析失败伪装成 ¥0.00。
 */
export function formatMoneyCny(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? value : Number(value.replace(/[,¥\s]/g, ""));
  if (typeof value === "string" && value.replace(/[,¥\s]/g, "") === "") return null;
  if (!Number.isFinite(raw)) return null;
  const sign = raw < 0 ? "-" : "";
  const abs = Math.abs(raw);
  if (abs >= WAN_DISPLAY_THRESHOLD) {
    const wan = abs / WAN;
    return `${sign}¥${wan.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 万`;
  }
  return `${sign}¥${abs.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  /** 仅 AI 草稿卡携带：借贷是否平（null = 后端未校验），供卡上可见标记。 */
  balanced?: boolean | null;
  /** 仅 AI 草稿卡携带：AI 自动化分级（manual = 低置信，需人工判断）。 */
  proposalLevel?: CloseDraft["proposalLevel"];
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
    draftId: draft.id,
    balanced: draft.balanced,
    proposalLevel: draft.proposalLevel
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
