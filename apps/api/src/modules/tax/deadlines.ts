/**
 * P7-B3 申报到期提醒（纯函数，可测）
 *
 * 中国按月申报通常为次月 15 日前（节假日顺延，此处取 15 日基准）。
 * 给定所属期与已提交记录，计算各税种到期日、剩余天数与紧急度。
 */

export interface TaxDeadlineInput {
  period: string;        // 所属期 YYYY-MM
  today: string;         // YYYY-MM-DD
  filedTypes: string[];  // 已生成/提交申报的税种
}

export interface TaxDeadline {
  taxType: string;
  label: string;
  dueDate: string;       // YYYY-MM-DD
  daysLeft: number;      // 距今天数（负=已逾期）
  filed: boolean;
  urgent: boolean;       // 未申报且 <=5 天或已逾期
}

const OBLIGATIONS: { taxType: string; label: string }[] = [
  { taxType: "vat", label: "增值税及附加" },
  { taxType: "iit", label: "个人所得税扣缴" },
  { taxType: "si", label: "社保费" },
  { taxType: "housing_fund", label: "住房公积金" },
];

/** 所属期次月 15 日。 */
function dueDateForPeriod(period: string): string {
  const parts = period.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const nextMonth = m === 12 ? 1 : m + 1;
  const year = m === 12 ? y + 1 : y;
  return `${year}-${String(nextMonth).padStart(2, "0")}-15`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export function buildTaxDeadlines(input: TaxDeadlineInput): TaxDeadline[] {
  const dueDate = dueDateForPeriod(input.period);
  const filed = new Set(input.filedTypes);
  return OBLIGATIONS.map((o) => {
    const isFiled = filed.has(o.taxType);
    const daysLeft = daysBetween(input.today, dueDate);
    return {
      taxType: o.taxType,
      label: o.label,
      dueDate,
      daysLeft,
      filed: isFiled,
      urgent: !isFiled && daysLeft <= 5,
    };
  });
}
