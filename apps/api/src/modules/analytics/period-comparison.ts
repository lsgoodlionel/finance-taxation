/**
 * 多期间同比/环比与预算差异（E1）。
 *
 * 纯计算：给定当期与对比期（上年同期=同比，上期=环比）数值，产出变化额与
 * 变化率；预算差异给出实际 vs 预算的差额、执行率与超支/结余状态。除零安全。
 */

export interface PeriodComparison {
  current: number;
  previous: number;
  /** current − previous。 */
  delta: number;
  /** delta / |previous|；previous 为 0 时：current 为 0 → 0，否则 null（无法计算率）。 */
  changeRate: number | null;
}

export function comparePeriods(current: number, previous: number): PeriodComparison {
  const delta = current - previous;
  let changeRate: number | null;
  if (previous === 0) {
    changeRate = current === 0 ? 0 : null;
  } else {
    changeRate = delta / Math.abs(previous);
  }
  return { current, previous, delta, changeRate };
}

export type BudgetStatus = "over" | "under" | "on_track";

export interface BudgetVariance {
  actual: number;
  budget: number;
  /** actual − budget（正=超支）。 */
  variance: number;
  /** actual / budget 执行率；budget 为 0 时为 null。 */
  utilization: number | null;
  status: BudgetStatus;
}

export function budgetVariance(actual: number, budget: number): BudgetVariance {
  const variance = actual - budget;
  const utilization = budget === 0 ? null : actual / budget;
  let status: BudgetStatus;
  if (variance > 0) {
    status = "over";
  } else if (variance < 0) {
    status = "under";
  } else {
    status = "on_track";
  }
  return { actual, budget, variance, utilization, status };
}
