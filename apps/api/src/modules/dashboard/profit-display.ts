/**
 * 驾驶舱盈利数字的展示口径 —— 卡片与趋势图共用一套舍入。
 *
 * 这里被抽出来，是因为「本月」这个数会在同一屏上出现两次：利润概览卡片里一次，
 * 趋势图最后一个点上一次。两边若各自 `Math.round`，同一个月就可能在卡上写 100
 * 而在图上画 101——老板看到的是同一页自相矛盾，而不是什么舍入误差。
 */
import type { ProfitTotals } from "../reports/profit-accounts.js";

export interface WholeYuanProfit {
  revenue: number;
  cost: number;
  /** 期间费用合计，**不含所得税费用**（所得税在 incomeTax 中单列）。 */
  expense: number;
  incomeTax: number;
  grossProfit: number;
  netProfit: number;
}

export function formatWhole(value: number): string {
  return Math.round(value).toString();
}

export function formatRate(numerator: number, denominator: number): string {
  if (!denominator) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

/**
 * 把利润表合计整成「整元展示口径」，保证展示层的恒等式成立。
 *
 * 此前六个字段各自独立 `Math.round(原始值)`，舍入误差互不相关，于是
 * `收入 − 成本 − 费用 − 所得税 = 净利` 与 `收入 − 成本 = 毛利` 在展示层随机不成立。
 * 例：收入 100.4 / 成本 0.5 / 费用 0 → 分别舍入得 100、1、0，毛利原始值 99.9 舍入得
 * 100，而 100 − 1 = 99 ≠ 100。费用构成饼图同理会出现「各分块之和 ≠ 营业收入」，
 * 分块比例加起来不是 100%。
 *
 * 改为**只对四个叶子项（收入/成本/费用/所得税）舍入一次**，毛利与净利由已舍入的
 * 叶子项派生。代价是派生值与真实值最多差几元（各叶子项舍入误差之和），换来的是
 * 老板在卡片上做的任何一次心算都对得上。毛利率/净利率同样用已舍入的口径计算，
 * 否则会出现「净利 100 ÷ 收入 100 = 99.60%」这种自相矛盾的展示。
 */
export function toWholeYuanOverview(totals: ProfitTotals): WholeYuanProfit {
  const revenue = Math.round(totals.revenue);
  const cost = Math.round(totals.cost);
  const expense = Math.round(totals.expense);
  const incomeTax = Math.round(totals.incomeTax);
  const grossProfit = revenue - cost;
  return {
    revenue,
    cost,
    expense,
    incomeTax,
    grossProfit,
    netProfit: grossProfit - expense - incomeTax
  };
}
