/**
 * 驾驶舱会计期间的月份算法 —— 全站唯一一处。
 *
 * 此前「本期边界」写在 routes.ts 的 resolveDashboardPeriod 里、「上期期末」写在
 * kpi.ts 的 previousPeriodEndDate 里，两处各自用 `Date.UTC` 拼月末。趋势接口需要
 * 的是「往前推 N 个期间」，若再抄第三份，跨年与月长这两个坑就得踩第三次。
 *
 * 全程走 `Date.UTC`，结果与运行时时区无关：`new Date("2026-07-01")` 在 UTC+8 下
 * 取本地月份会得到 6 月，把每月 1 号整体前移一期。
 */

/** 会计期间标签的格式：`YYYY-MM`。 */
export const PERIOD_LABEL_PATTERN = /^\d{4}-\d{2}$/;

export interface PeriodBounds {
  label: string;
  /** 期间首日，闭区间。 */
  startDate: string;
  /** 期间末日，闭区间（自动处理月长与闰年）。 */
  endDate: string;
}

export function isPeriodLabel(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && PERIOD_LABEL_PATTERN.test(raw);
}

function labelParts(label: string): { year: number; month: number } {
  return { year: Number(label.slice(0, 4)), month: Number(label.slice(5, 7)) };
}

/** `YYYY-MM` → 该期间的闭区间边界。`Date.UTC(y, m, 0)` 即该月最后一天。 */
export function periodBounds(label: string): PeriodBounds {
  const { year, month } = labelParts(label);
  return {
    label,
    startDate: `${label}-01`,
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  };
}

/** 上一会计期间：`2026-01` → `2025-12`（跨年由 Date.UTC 自动处理）。 */
export function previousPeriodLabel(label: string): string {
  const { year, month } = labelParts(label);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

/**
 * 以 `endLabel` 为最后一个期间，往前取 `months` 个连续期间，**升序**返回。
 *
 * 返回的是完整的连续序列，不跳过没有账的月份：趋势图上「这个月没有数据」必须
 * 表现为一个断点，而不是把它从横轴上抹掉——横轴少一格会让相邻两个月看起来是连着的。
 */
export function trailingPeriodLabels(endLabel: string, months: number): string[] {
  const { year, month } = labelParts(endLabel);
  return Array.from({ length: months }, (_, index) =>
    new Date(Date.UTC(year, month - months + index, 1)).toISOString().slice(0, 7)
  );
}
