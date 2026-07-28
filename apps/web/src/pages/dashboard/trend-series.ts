/**
 * 收支趋势图的数据映射 —— 从接口返回到图上的点，中间不许有第二个数据源。
 *
 * 这一层被单独拆出来做纯函数，就是为了让「每个点都来自接口返回」变成一条可执行的
 * 断言（见 trend-series.test.ts）。上一版趋势图正是死在这上面：它只拿到本月一个
 * 真实值，另外 5 个点由 `const factors = [0.72, 0.81, ...]` 乘出来，画出的曲线必然
 * 单调上升，与公司实际是增长还是下滑无关。
 *
 * 因此本模块只做两件事：解析后端下发的金额字符串、给横轴一个短标签。
 * 没有任何插值、平滑、补零或外推——缺的月份原样缺着。
 */
import type { ChairmanTrendData, ChairmanTrendPoint } from "../../lib/api";

/**
 * 图上的一行。金额为 `null` 表示该期间没有账，recharts 会画成断点
 * （`connectNulls` 保持默认的 false）。
 */
export interface TrendChartRow {
  /** 会计期间 `YYYY-MM`，tooltip 用它显示完整期间。 */
  period: string;
  /** 横轴短标签。 */
  label: string;
  hasData: boolean;
  revenue: number | null;
  cost: number | null;
  expense: number | null;
}

/**
 * 解析后端的金额字符串。
 *
 * `null` 是后端明确表达的「这个月没有账」，必须原样传下去；解析不出数字的脏值同样
 * 退化成 `null`——宁可断一格，也不能把一个填充值画成实测点。
 */
function parseAmount(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** `2026-05` → `5月`。完整期间在 tooltip 里给，横轴只求短。 */
export function periodLabel(period: string): string {
  const month = Number.parseInt(period.slice(5, 7), 10);
  return Number.isFinite(month) ? `${month}月` : period;
}

function toRow(point: ChairmanTrendPoint): TrendChartRow {
  return {
    period: point.period,
    label: periodLabel(point.period),
    hasData: point.hasData,
    revenue: parseAmount(point.revenue),
    cost: parseAmount(point.cost),
    expense: parseAmount(point.expense)
  };
}

/**
 * 接口返回 → 图上的行，一一对应，不增不减。
 *
 * 没有账的期间保留在序列里（横轴上照样占一格）：把空月抹掉会让它两边的月份在图上
 * 紧挨着，读起来像是连续的两个月。
 */
export function buildTrendSeries(trend: ChairmanTrendData): TrendChartRow[] {
  return trend.points.map(toRow);
}

/** 整段区间一个月都没有账：该整块留白，而不是画一张全是断点的空图。 */
export function hasAnyTrendData(trend: ChairmanTrendData): boolean {
  return trend.periodsWithData > 0;
}

/**
 * 图注文案：如实说明这张图覆盖了哪几个期间、其中几个没有账。
 * 缺口不是需要藏起来的瑕疵，它本身就是「那几个月我们没记账」这条信息。
 *
 * 只返回区间与缺口，取数来源那句留在组件的 JSX 里 —— 「总账」「分录」是需要挂
 * <Term> 释义的术语，字符串里挂不了（见 lib/terminology-coverage.test.mjs）。
 */
export function describeTrendCoverage(trend: ChairmanTrendData): string {
  const missing = trend.points.length - trend.periodsWithData;
  const range =
    trend.points.length > 0
      ? `${trend.points[0]!.period} 至 ${trend.points[trend.points.length - 1]!.period}`
      : trend.endPeriod;
  if (missing === 0) return range;
  return `${range}，其中 ${missing} 个期间没有账务数据，图上留空`;
}
