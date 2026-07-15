/**
 * V7 L4 会计期间快切：纯函数，按月位移 'YYYY-MM' 期间字符串。
 * 跨年自动进位/借位；非法输入（格式错误、月份越界）原样返回，不抛错。
 */
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;

export function shiftPeriod(period: string, delta: number): string {
  if (!PERIOD_PATTERN.test(period) || !Number.isInteger(delta)) return period;

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const totalMonths = year * MONTHS_PER_YEAR + (month - 1) + delta;
  if (totalMonths < 0) return period;

  const nextYear = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const nextMonth = (totalMonths % MONTHS_PER_YEAR) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}
