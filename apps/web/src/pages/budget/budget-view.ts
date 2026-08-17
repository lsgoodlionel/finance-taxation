/**
 * 预算中心的展示逻辑（V13-A2）。
 *
 * 从组件里拆出来是为了能测：这里的每一条都是「数字怎么解读」的判断，
 * 而那类判断错了不会崩、只会静静地把超支显示成正常。
 */

import type { BudgetWithUsage } from "../../lib/api-expense-control";

/** 预算的执行状态。 */
export type BudgetStatus = "healthy" | "tight" | "overrun";

/** 可用额度低于这个比例即视为吃紧。 */
export const TIGHT_THRESHOLD_RATIO = 0.1;

/**
 * 一条预算的执行状态。
 *
 * **超支的判据是可用额度为负，与预算额是否为零无关**：预算 0 元而已经花了钱，
 * 那就是超支，不是「没立预算所以不管」——没立预算的情形根本不会有这条记录。
 */
export function budgetStatus(budget: BudgetWithUsage): BudgetStatus {
  if (budget.availableCents < 0) return "overrun";
  // 预算为 0 且没花钱：可用额度是 0，比例算不出来。归为 healthy——
  // 「立了 0 元预算且一分没花」确实没有任何问题。
  if (budget.amountCents === 0) return "healthy";
  return budget.availableCents / budget.amountCents < TIGHT_THRESHOLD_RATIO ? "tight" : "healthy";
}

/**
 * 执行率：已用 ÷ 预算。
 *
 * 预算为 0 时返回 null 而不是 0 或 Infinity——「0 元预算的执行率」没有意义，
 * 返回一个数会让它出现在进度条上并显示成 0% 或 100%，两者都在撒谎。
 */
export function utilizationRatio(budget: BudgetWithUsage): number | null {
  if (budget.amountCents === 0) return null;
  return (budget.encumberedCents + budget.actualCents) / budget.amountCents;
}

/** 分 → 带千分位的元，用于表格展示。 */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 维度的人话描述。
 *
 * null 的两个维度要说成「全公司」「不限科目」而不是留空——空白单元格
 * 会被读成「数据没填」，而它其实是明确的语义。
 */
export function describeDimension(budget: BudgetWithUsage, costCenterName?: string): string {
  const dept = budget.costCenterId === null ? "全公司" : costCenterName ?? budget.costCenterId;
  const account = budget.accountCode === null ? "不限科目" : budget.accountCode;
  return `${dept} · ${account}`;
}

/** 期间类型的中文label。 */
export const PERIOD_TYPE_LABELS: Record<BudgetWithUsage["periodType"], string> = {
  month: "月度",
  quarter: "季度",
  year: "年度"
};

/**
 * 汇总一组预算的超支情况。
 *
 * **不做求和汇总**：不同期间、不同维度的预算相加没有意义（月度预算与年度
 * 预算相加、部门预算与全公司预算相加都是重复计算）。只数条数——这是唯一
 * 不会误导人的聚合。
 */
export function countOverruns(budgets: readonly BudgetWithUsage[]): number {
  return budgets.filter((item) => budgetStatus(item) === "overrun").length;
}
