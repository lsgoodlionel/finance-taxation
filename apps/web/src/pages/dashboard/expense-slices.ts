/**
 * 驾驶舱「本月费用构成」饼图的纯数据逻辑。
 *
 * 拆成独立模块（与 kpi-trend.ts 同一模式），让口径可以被单测直接覆盖，
 * 而不必在测试里复制一份实现——复制版本正是此前漏掉所得税的地方。
 *
 * ## P1：改用后端下发的真实构成
 *
 * 此前成本与费用的内部拆分是**按固定比例估算**的（主营成本 65%、人工 20%……）。
 * 那张图是给老板看的，他会据此判断「人工成本占比是不是太高」——
 * 而那个数字根本不是真的。**编出来的比例比不显示更糟。**
 *
 * 后端现在下发 `expenseBreakdown`（按科目汇总的真实金额）。
 * 没有下发时退回估算，并**在图上标明是估算**——降级要让人看得见。
 */
import type { DashboardData } from "../../lib/api";

/**
 * 估算拆分比例。**只在后端没下发明细时用**，且用时会标注「估算」。
 *
 * 保留它是因为旧部署可能还没升级后端；一旦全量升级完就该删掉，
 * 而不是留着当默认路径。
 */
const SALES_COST_RATIO = 0.65;
const LABOR_COST_RATIO = 0.2;
const SELLING_EXPENSE_RATIO = 0.4;
const MANAGEMENT_EXPENSE_RATIO = 0.35;

export interface ExpenseSlice {
  name: string;
  value: number;
}

/** 后端下发的按科目构成。 */
export interface ExpenseBreakdownSlice {
  name: string;
  accountCode: string;
  amount: number;
  kind: "cost" | "expense" | "incomeTax";
}

export interface ExpenseChartData {
  slices: ExpenseSlice[];
  /**
   * 成本与费用的内部拆分是不是估算的。
   *
   * **必须显示给用户**——一张标着「主营成本 65%」而实际没人算过的图，
   * 会被当成分析依据。
   */
  isEstimated: boolean;
}

/**
 * 挑选数据来源：后端下发了明细就用真实的，没下发才估算。
 *
 * **`undefined` 与 `[]` 语义不同**（本项目一贯口径）：
 * - `undefined` = 后端还没升级，没这个字段 → 退回估算，标注「估算」
 * - `[]` = 后端算过了，本期确实没有费用分录 → 如实画空，不许拿估算去填
 *
 * 把两者混为一谈，会让一家本期零费用的公司看到一张编出来的费用图。
 */
export function resolveExpenseChart(data: DashboardData): ExpenseChartData {
  if (data.expenseBreakdown === undefined) {
    return { slices: buildExpenseData(data.profitOverview), isEstimated: true };
  }
  return buildExpenseDataFromBreakdown(data.profitOverview, data.expenseBreakdown);
}

/**
 * 用后端下发的真实构成画图。
 *
 * 净利润仍然自己算——它不是费用科目，后端的 breakdown 里没有它，
 * 而饼图要回答的是「营业收入去了哪里」，缺了利润那块就不完整。
 */
export function buildExpenseDataFromBreakdown(
  overview: DashboardData["profitOverview"],
  breakdown: readonly ExpenseBreakdownSlice[]
): ExpenseChartData {
  const revenue = parseAmount(overview.revenue);
  const spent = breakdown.reduce((sum, slice) => sum + slice.amount, 0);
  const profit = Math.max(0, revenue - spent);

  const slices: ExpenseSlice[] = breakdown.map((slice) => ({
    name: slice.name,
    value: Math.round(slice.amount)
  }));
  if (profit > 0) slices.push({ name: "净利润", value: Math.round(profit) });

  return { slices: slices.filter((slice) => slice.value > 0), isEstimated: false };
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

  // **降级路径**：后端没下发明细时按固定比例估算，余数归入最后一档，
  // 保证「成本三块之和 = 成本合计」「费用三块之和 = 费用合计」始终成立。
  // 调用方拿到 isEstimated=true 时必须在图上标明，否则用户会把估算当实数。
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
