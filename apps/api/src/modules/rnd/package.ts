import type {
  RndCostLine,
  RndProject,
  RndTimeEntry,
  SuperDeductionPackage
} from "@finance-taxation/domain-model";
import { buildRndProjectSummary } from "./summary.js";

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * 加计扣除税前扣除总额的倍数。
 *
 * 政策依据：财政部、税务总局公告 2023 年第 7 号 ——「企业开展研发活动中实际发生
 * 的研发费用，未形成无形资产计入当期损益的，在按规定据实扣除的基础上，自 2023 年
 * 1 月 1 日起，再按照实际发生额的 100% 在税前加计扣除」。
 *
 * 因此**税前扣除总额 = 据实 100% + 加计 100% = 基数 × 2**，而不是只有加计的
 * 那一半。`suggestedDeductionAmount` 表达的是前者（总额），命名容易被读成后者，
 * 前端展示时务必写成「可扣除总额」而非「加计扣除额」。
 *
 * 前端一度自造过两个税率（基数含资本化 × 0.6、扣除额 × 0.75），后者是 2023 年前
 * 的旧比例，前者在政策与后端里都找不到出处 —— 用户按预览做的决定与最终台账对
 * 不上。口径以本模块为唯一真源，前端不得再自行计算。
 */
const PRE_TAX_DEDUCTION_MULTIPLIER = 2;

export function buildSuperDeductionPackage(
  project: RndProject,
  costLines: RndCostLine[],
  timeEntries: RndTimeEntry[],
  now: string
): SuperDeductionPackage {
  const summary = buildRndProjectSummary(project, costLines, timeEntries);
  const eligibleBase = Number(summary.superDeductionEligibleBase || 0);
  return {
    projectId: project.id,
    projectName: project.name,
    expenseAmount: summary.expenseAmount,
    capitalizedAmount: summary.capitalizedAmount,
    eligibleBase: summary.superDeductionEligibleBase,
    suggestedDeductionAmount: formatAmount(eligibleBase * PRE_TAX_DEDUCTION_MULTIPLIER),
    checklist: [
      "研发项目立项资料",
      "研发人员工时记录",
      "研发支出归集明细",
      "相关合同、发票和付款凭证",
      "费用化/资本化判断说明"
    ],
    generatedAt: now
  };
}
