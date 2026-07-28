/**
 * 申报义务推导（纯逻辑）。
 *
 * 从 TaxCalendar 组件里抽出来，原因是「到期/逾期」不只日历自己要用：
 * 任务切换器的角标要显示「本期还有几笔逾期」，好让该做的事自己浮上来。
 * 逻辑留在组件里就只能复制一份，一旦口径漂移，角标和日历会互相打架。
 *
 * now 作为参数注入（而不是在函数体里取 new Date()），是为了让「还剩几天 / 是否逾期」
 * 这类与当天相关的推导可被确定性地单测。
 */
import type { TaxFilingBatch } from "@finance-taxation/domain-model";

/** 法定申报节奏：次月 15 日前申报上月（季度税种只在季末月产生义务）。 */
export const TAX_SCHEDULE = [
  { taxType: "vat", label: "增值税", dueDay: 15, frequency: "monthly", color: "#2563eb", bg: "#eff6ff" },
  { taxType: "iit", label: "个人所得税", dueDay: 15, frequency: "monthly", color: "#7c3aed", bg: "#f5f3ff" },
  { taxType: "stamp", label: "印花税", dueDay: 15, frequency: "monthly", color: "#d97706", bg: "#fffbeb" },
  { taxType: "cit", label: "企业所得税", dueDay: 15, frequency: "quarterly", color: "#16a34a", bg: "#f0fdf4" }
] as const;

export type TaxObligationType = (typeof TAX_SCHEDULE)[number]["taxType"];

export type TaxObligationStatus = "filed" | "pending" | "overdue";

export interface TaxObligation {
  taxType: TaxObligationType;
  label: string;
  dueDay: number;
  frequency: "monthly" | "quarterly";
  color: string;
  bg: string;
  dueDate: Date;
  daysRemaining: number;
  status: TaxObligationStatus;
  batchId: string | null;
  batchStatus: string | null;
}

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

/** 申报期（YYYY-MM）默认取当月。 */
export function currentFilingPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function isQuarterEnd(month: number): boolean {
  return month === 3 || month === 6 || month === 9 || month === 12;
}

/**
 * 推导某个申报期下每个税种的申报义务。
 *
 * 已完成的判定沿用批次状态：批次已提交或已留档即视为已申报；
 * 否则按截止日与当天比较，过期未报为逾期。
 */
export function deriveTaxObligations(
  batches: readonly TaxFilingBatch[],
  period: string,
  now: Date = new Date()
): TaxObligation[] {
  const parts = period.split("-");
  const year = Number.parseInt(parts[0] ?? "", 10);
  const month = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return [];
  }

  return TAX_SCHEDULE.flatMap((schedule): TaxObligation[] => {
    if (schedule.frequency === "quarterly" && !isQuarterEnd(month)) {
      return [];
    }

    // month 已是 1-based，作为 Date 的 0-based 月份传入即得「次月」。
    const dueDate = new Date(year, month, schedule.dueDay);
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / MILLISECONDS_PER_DAY);

    const batch =
      batches.find(
        (item) =>
          item.taxType.toLowerCase().includes(schedule.taxType) && item.filingPeriod.startsWith(period)
      ) ?? null;

    const isFiled = batch?.status === "submitted" || batch?.status === "archived";
    const status: TaxObligationStatus = isFiled ? "filed" : daysRemaining < 0 ? "overdue" : "pending";

    return [
      {
        ...schedule,
        dueDate,
        daysRemaining,
        status,
        batchId: batch?.id ?? null,
        batchStatus: batch?.status ?? null
      }
    ];
  });
}

export function countOverdueObligations(obligations: readonly TaxObligation[]): number {
  return obligations.filter((item) => item.status === "overdue").length;
}

export function countFiledObligations(obligations: readonly TaxObligation[]): number {
  return obligations.filter((item) => item.status === "filed").length;
}
