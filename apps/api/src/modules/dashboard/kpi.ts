/**
 * 驾驶舱 KPI 卡片的取数与呈现工具。
 *
 * 背景：`trend` 字段此前是 `trendSign(value)`——把卡片自身的数值加个正负号再
 * 输出（余额 1,535,000 → `+1,535,000`）。前端 DashboardKpiCards 把它渲染成带
 * 涨跌箭头的 Tag 并在旁边写死「环比上月」，于是一个静态余额被读成了「本月比
 * 上月多了 153 万」。这不是环比，是呈现失实。这里给出真正的环比实现。
 */
import { periodBounds, previousPeriodLabel } from "./period.js";

/** 上期无数据（公司首个有账期间）时的降级文案。 */
export const NO_PRIOR_PERIOD_TREND = "无上期数据";

/** 环比变化在展示精度内可忽略时的文案（前端渲染为中性 Tag）。 */
export const FLAT_TREND = "持平";

/** 该卡片不存在可还原的历史口径，因此不给增长语义。 */
export const NO_TREND_AVAILABLE = "—";

/**
 * 卡片金额展示到「元」，因此不足 0.5 元的环比变化四舍五入后就是 0；
 * 若不拦住，-0.4 会被格式化成「-0」并渲染成红色下跌箭头。
 */
const TREND_EPSILON = 0.5;

/**
 * 保留金额符号：此前用 Math.abs 抹掉方向，导致增值税留抵/多缴（2221 借方余额，
 * 税负为负）被显示成「要交 ¥50,000」，方向完全反了。
 */
export function formatAmount(value: number): string {
  // 归零负零：-0 经 toLocaleString 会输出「-0」，在「本月要交多少税」等卡片上
  // 读起来像"负的税"，实际只是没有数据/正好为零。
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/**
 * 上一会计期间的期末日期：`2026-05` → `2026-04-30`。
 * 月份算法统一在 dashboard/period.ts，跨年与月长只在那里处理一次。
 */
export function previousPeriodEndDate(periodLabel: string): string {
  return periodBounds(previousPeriodLabel(periodLabel)).endDate;
}

/**
 * 余额类卡片（可动用资金 / 待回款 / 应交税费）的真实环比：
 * 本期期末余额 − 上期期末余额，即「这个月比上个月多/少了多少钱」。
 *
 * 用绝对差额而非百分比，理由有三：
 * 1. 上期余额可能为 0（新公司、科目本期才启用），百分比会除零；
 * 2. 余额可能为负（2221 借方＝留抵），百分比的正负号会反转，读起来更危险；
 * 3. 卡片主体已经是金额，差额与主体同量纲，老板一眼可对。
 *
 * @param previous 上期期末余额；`null` 表示上期根本没有账（首期），此时降级为文案。
 */
export function formatBalanceTrend(current: number, previous: number | null): string {
  if (previous === null) return NO_PRIOR_PERIOD_TREND;
  const delta = current - previous;
  if (Math.abs(delta) < TREND_EPSILON) return FLAT_TREND;
  return delta > 0 ? `+${formatAmount(delta)}` : formatAmount(delta);
}
