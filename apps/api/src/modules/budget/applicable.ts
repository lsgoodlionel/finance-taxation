/**
 * 筛选适用于某笔支出的预算（V13-A2）。
 *
 * ## 与费用标准的根本区别：全部适用，不是挑一条
 *
 * 费用标准是「按哪一条判」——同一笔住宿只能有一个限额，所以 `match.ts` 用
 * 最具体优先挑出唯一一条。
 *
 * 预算是「每一条都不能超」。一笔研发部的差旅费可能同时落在三条预算下：
 * 研发部差旅预算、研发部总预算、公司差旅预算。部门预算没超但公司总预算超了，
 * 一样要拦。**挑一条就等于放弃了另外两条的控制力**。
 *
 * 拆成独立模块（而不是留在 queries.ts 里）是为了能脱离数据库测试——这段
 * 匹配逻辑的分支比取数本身多。
 */

import { periodKeyToDateRange, type BudgetPeriodType } from "./period.js";

/** 匹配只需要这几个字段，不依赖完整的 BudgetRow，便于测试构造。 */
export interface BudgetDimension {
  periodType: BudgetPeriodType;
  periodKey: string;
  /** null = 全公司预算。 */
  costCenterId: string | null;
  /** null = 不限科目的总额预算；非空时按**前缀**匹配。 */
  accountCode: string | null;
}

export interface ExpenseCriteria {
  /** 费用发生日，YYYY-MM-DD。 */
  date: string;
  accountCode: string;
  /** 支出归属的成本中心；null 表示未指定。 */
  costCenterId: string | null;
}

/**
 * 一条预算是否管得着这笔支出。
 *
 * 三个维度全部要满足：期间包含、科目前缀命中、部门匹配。
 *
 * **未指定成本中心的支出不落入任何部门预算**，也不按比例摊派——与 V12-D1
 * 部门费用报表把它们单列为「未指定」的处理一致：照实反映，不替用户猜。
 * 它们仍然落入全公司预算，因为那条预算本就不分部门。
 */
export function isBudgetApplicable(budget: BudgetDimension, criteria: ExpenseCriteria): boolean {
  const { startDate, endDate } = periodKeyToDateRange(budget.periodType, budget.periodKey);
  if (criteria.date < startDate || criteria.date > endDate) return false;

  if (budget.accountCode !== null && !criteria.accountCode.startsWith(budget.accountCode)) {
    return false;
  }

  if (budget.costCenterId !== null && budget.costCenterId !== criteria.costCenterId) {
    return false;
  }

  return true;
}

/** 全部适用的预算，保持入参顺序，不修改入参。 */
export function filterApplicableBudgets<T extends BudgetDimension>(
  budgets: readonly T[],
  criteria: ExpenseCriteria
): T[] {
  return budgets.filter((budget) => isBudgetApplicable(budget, criteria));
}
