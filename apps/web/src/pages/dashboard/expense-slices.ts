/**
 * 驾驶舱「本月费用构成」饼图的纯数据逻辑。
 *
 * 拆成独立模块（与 kpi-trend.ts 同一模式），让口径可以被单测直接覆盖，
 * 而不必在测试里复制一份实现——复制版本正是此前漏掉所得税的地方。
 */
import type { DashboardData } from "../../lib/api";

/** 成本内部的估算拆分比例，余数归入「其他成本」，保证三块之和等于成本合计。 */
const SALES_COST_RATIO = 0.65;
const LABOR_COST_RATIO = 0.2;

/** 期间费用内部的估算拆分比例，余数归入「财务费用」，保证三块之和等于费用合计。 */
const SELLING_EXPENSE_RATIO = 0.4;
const MANAGEMENT_EXPENSE_RATIO = 0.35;

export interface ExpenseSlice {
  name: string;
  value: number;
}

function parseAmount(value: string): number {
  const parsed = parseFloat((value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 把盈利概览拆成「营业收入去了哪里」的饼图分块。
 *
 * 不变式：各分块之和 = 营业收入。后端已把所得税费用从 `expense` 中拆出
 * （利润总额不再扣所得税、净利只减一次），所以这里必须把 `incomeTax` 单列成
 * 一块并从利润里扣除；否则利润会虚高一个税额，各分块之和也少了税额那一块。
 *
 * 例外：亏损期间没有「净利润」这一块可画，利润截断为 0，此时各分块之和等于
 * 成本 + 费用 + 所得税，大于营业收入。饼图无法表达负值分块，这是有意为之。
 */
export function buildExpenseData(overview: DashboardData["profitOverview"]): ExpenseSlice[] {
  const cost = parseAmount(overview.cost);
  const expense = parseAmount(overview.expense);
  const incomeTax = parseAmount(overview.incomeTax);
  const revenue = parseAmount(overview.revenue);

  // 成本与费用的内部构成后端暂未下发，这里按固定比例估算，余数归入最后一档，
  // 保证「成本三块之和 = 成本合计」「费用三块之和 = 费用合计」始终成立。
  const salesCost = Math.round(cost * SALES_COST_RATIO);
  const laborCost = Math.round(cost * LABOR_COST_RATIO);
  const otherCost = cost - salesCost - laborCost;

  const selling = Math.round(expense * SELLING_EXPENSE_RATIO);
  const mgmt = Math.round(expense * MANAGEMENT_EXPENSE_RATIO);
  const finance = expense - selling - mgmt;

  const profit = Math.max(0, revenue - cost - expense - incomeTax);

  return [
    { name: "主营成本", value: salesCost },
    { name: "人工成本", value: laborCost },
    { name: "其他成本", value: otherCost },
    { name: "销售费用", value: selling },
    { name: "管理费用", value: mgmt },
    { name: "财务费用", value: finance },
    { name: "所得税费用", value: incomeTax },
    { name: "净利润", value: profit },
  ].filter((slice) => slice.value > 0);
}
