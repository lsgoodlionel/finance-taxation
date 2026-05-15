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
    suggestedDeductionAmount: formatAmount(eligibleBase * 2),
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
