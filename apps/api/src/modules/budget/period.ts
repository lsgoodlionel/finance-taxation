/**
 * 预算期间与日期范围的换算（V13-A2）。
 *
 * 预算按月/季/年立，实际发生额要按日期范围去 `ledger_entries` 里取。换算错一天，
 * 季末或年末的单据就算到下一期去——那种错在报表上表现为「上季度没用完、这季度
 * 莫名超支」，从结果反查极难。所以单独成模块并逐个边界断言。
 *
 * 全程用 `YYYY-MM-DD` 字符串，不构造 `Date` 对象参与业务判断：会计期间是不带
 * 时区的业务日期，一旦经过 Date 就会被本地时区偏移，在 UTC+8 环境下表现为
 * 「月末那天算到下个月」。唯一用到 Date 的地方是算月末天数，且用 UTC 构造。
 */

export type BudgetPeriodType = "month" | "quarter" | "year";

export interface DateRange {
  /** 起日（含），YYYY-MM-DD。 */
  startDate: string;
  /** 止日（含），YYYY-MM-DD。 */
  endDate: string;
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_KEY = /^(\d{4})-Q([1-4])$/;
const YEAR_KEY = /^(\d{4})$/;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * 某年某月的天数。
 *
 * `Date.UTC(year, month, 0)` 取的是「上个月的最后一天」——月份传 1-based 的
 * 当月号即得当月末日。用 UTC 而非本地时区构造，否则 UTC+8 下会偏一天。
 * 这样闰年规则（含百年不闰、四百年再闰）直接交给平台，不自己写。
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 期间键 → 日期范围（两端闭区间）。
 *
 * 格式与类型不配对时抛错而不是兜底：这个函数的入参可能来自接口查询串而不是
 * 库里的行（库里有 CHECK 约束，接口没有），静默返回「差不多的」范围会让超支
 * 算到错误的期间去。
 */
export function periodKeyToDateRange(periodType: BudgetPeriodType, periodKey: string): DateRange {
  if (periodType === "month") {
    const matched = MONTH_KEY.exec(periodKey);
    if (!matched) throw new Error(`期间键 ${periodKey} 与类型 month 不匹配，应形如 2026-06`);
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    return {
      startDate: `${matched[1]}-${matched[2]}-01`,
      endDate: `${matched[1]}-${matched[2]}-${pad2(daysInMonth(year, month))}`
    };
  }

  if (periodType === "quarter") {
    const matched = QUARTER_KEY.exec(periodKey);
    if (!matched) throw new Error(`期间键 ${periodKey} 与类型 quarter 不匹配，应形如 2026-Q2`);
    const year = matched[1];
    const quarter = Number(matched[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      startDate: `${year}-${pad2(startMonth)}-01`,
      endDate: `${year}-${pad2(endMonth)}-${pad2(daysInMonth(Number(year), endMonth))}`
    };
  }

  const matched = YEAR_KEY.exec(periodKey);
  if (!matched) throw new Error(`期间键 ${periodKey} 与类型 year 不匹配，应形如 2026`);
  return { startDate: `${matched[1]}-01-01`, endDate: `${matched[1]}-12-31` };
}

/**
 * 某个业务日期是否落在期间内。
 *
 * 申请单用它反查「这笔支出该占哪个期间的预算」。日期串是定长格式，
 * 字典序即时间序，直接比较。
 */
export function periodKeyContains(
  periodType: BudgetPeriodType,
  periodKey: string,
  date: string
): boolean {
  const { startDate, endDate } = periodKeyToDateRange(periodType, periodKey);
  return date >= startDate && date <= endDate;
}
