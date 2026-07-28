/**
 * 董事长驾驶舱的历史收支趋势 —— 按会计期间聚合总账分录。
 *
 * ## 为什么有这个模块
 *
 * 前端「近 6 月收支趋势」图曾经是编的：把本月 revenue/cost 乘一组写死系数
 * `[0.72, 0.81, 0.88, 0.94, 0.97, 1.0]` 当作前 5 个月，于是无论公司实际增长还是
 * 下滑，图上永远是一条单调上升的曲线。那张图已被删除，理由是后端当时给不出按
 * 期间的历史损益（`/api/rnd/trend` 是研发专用）。本模块就是补上那个缺口。
 *
 * ## 口径
 *
 * 与驾驶舱盈利概览（dashboard/summary.ts 的 profitOverview）**逐字段一致**，靠的
 * 是三者共用同一批纯函数而不是各自实现：
 * - 科目分类走 `summarizeProfitTotals`（与正式利润表同源），所得税费用 6801 已从
 *   expense 中拆出、只在净利处扣一次；
 * - 结转损益分录一律排除（口径见 ledger/closing-entries.ts）。不排除的话月结一做完，
 *   被结转期间的收入/成本会整月塌成 0，趋势图上表现为「那个月公司没做生意」；
 * - 展示舍入走 `toWholeYuanOverview`，因此最后一个点与利润概览卡片上的数字相等。
 *
 * ## 没有数据的期间
 *
 * 一律 `hasData: false` + 各金额 `null`，**不补零、不外推**。补零会在图上画出一条
 * 落到 0 的实线，读起来是「这个月收入归零了」，而事实是「这个月没有账」——那是
 * 两件完全不同的事。与风险卡「与其编一个 +2，不如明确留白」是同一条纪律。
 */
import type { LedgerEntry } from "@finance-taxation/domain-model";
import { isPeriodClosingEntry } from "../ledger/closing-entries.js";
import { summarizeProfitTotals } from "../reports/profit-accounts.js";
import { trailingPeriodLabels } from "./period.js";
import { formatWhole, toWholeYuanOverview } from "./profit-display.js";

/** 趋势默认取 6 个期间，与被删掉的那张图的跨度一致。 */
export const DEFAULT_TREND_MONTHS = 6;

/** 至少 1 个期间：0 个点的趋势图没有意义。 */
export const MIN_TREND_MONTHS = 1;

/**
 * 至多 24 个期间。上限存在的理由是这里按期间对全量分录做 N 遍聚合，
 * 与 `/api/rnd/trend` 的 24 个月上限取齐。
 */
export const MAX_TREND_MONTHS = 24;

export interface ChairmanTrendPoint {
  /** 会计期间 `YYYY-MM`。 */
  period: string;
  /**
   * 该期间账上有没有分录。
   *
   * `false` 表示**没有账**，不是「收入为 0」。这两者必须分得开：一家 3 月才开业的
   * 公司，1、2 月是 `hasData: false`；而一个记了账、只是确实没开张的月份是
   * `hasData: true` + `revenue: "0"`。前者在图上是断点，后者是一个真实的 0。
   */
  hasData: boolean;
  revenue: string | null;
  cost: string | null;
  /** 期间费用合计，不含所得税费用。 */
  expense: string | null;
  incomeTax: string | null;
  grossProfit: string | null;
  netProfit: string | null;
}

export interface ChairmanTrend {
  /** 最后一个期间，即请求的当期。 */
  endPeriod: string;
  months: number;
  /** 连续的期间序列，升序；没有账的期间也占一格（见 trailingPeriodLabels）。 */
  points: ChairmanTrendPoint[];
  /**
   * 有账的期间数。为 0 表示整段区间都没有数据，前端据此整块留白，
   * 而不是画一张所有点都断开的空图。
   */
  periodsWithData: number;
}

/** 没有账的期间：所有金额留空，一个都不许填 0。 */
function emptyPoint(period: string): ChairmanTrendPoint {
  return {
    period,
    hasData: false,
    revenue: null,
    cost: null,
    expense: null,
    incomeTax: null,
    grossProfit: null,
    netProfit: null
  };
}

/**
 * 按会计期间把分录分桶。
 *
 * 期间边界是自然月（`periodBounds` 给出 `YYYY-MM-01` 到月末的闭区间），因此
 * `entryDate.slice(0, 7)` 与「落在该期间的闭区间内」完全等价，且只需扫一遍。
 * `entryDate` 是 PG `date` 经 `toDateOnly` 得到的 `YYYY-MM-DD`，不带时区。
 */
function groupEntriesByPeriod(entries: readonly LedgerEntry[]): Map<string, LedgerEntry[]> {
  const buckets = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const period = entry.entryDate.slice(0, 7);
    if (!period) continue;
    const bucket = buckets.get(period);
    if (bucket) {
      bucket.push(entry);
      continue;
    }
    buckets.set(period, [entry]);
  }
  return buckets;
}

function buildPoint(period: string, periodEntries: readonly LedgerEntry[]): ChairmanTrendPoint {
  // hasData 看的是「这个月账上有没有东西」，判定在排除结转分录**之前**：
  // 一个已结账期间当然是有账的，结转分录本身也是真实凭证。排除只发生在算钱的时候。
  if (periodEntries.length === 0) return emptyPoint(period);

  const operatingEntries = periodEntries.filter((entry) => !isPeriodClosingEntry(entry));
  const overview = toWholeYuanOverview(summarizeProfitTotals(operatingEntries));

  return {
    period,
    hasData: true,
    revenue: formatWhole(overview.revenue),
    cost: formatWhole(overview.cost),
    expense: formatWhole(overview.expense),
    incomeTax: formatWhole(overview.incomeTax),
    grossProfit: formatWhole(overview.grossProfit),
    netProfit: formatWhole(overview.netProfit)
  };
}

export function buildChairmanTrend(input: {
  endPeriod: string;
  months: number;
  ledgerEntries: readonly LedgerEntry[];
}): ChairmanTrend {
  const buckets = groupEntriesByPeriod(input.ledgerEntries);
  const points = trailingPeriodLabels(input.endPeriod, input.months).map((period) =>
    buildPoint(period, buckets.get(period) ?? [])
  );

  return {
    endPeriod: input.endPeriod,
    months: input.months,
    points,
    periodsWithData: points.filter((point) => point.hasData).length
  };
}

/**
 * 解析 `?months=`：缺省 6，越界钳到 [1, 24]，非法取值回落到缺省。
 *
 * 与 resolveDashboardPeriod「非法取值一律回落」的处理一致——首页的读接口宁可给
 * 一个合理的默认区间，也不要为一个拼错的查询参数把整块图变成报错。
 */
export function resolveTrendMonths(raw: string | null): number {
  if (raw === null) return DEFAULT_TREND_MONTHS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TREND_MONTHS;
  return Math.min(Math.max(parsed, MIN_TREND_MONTHS), MAX_TREND_MONTHS);
}
