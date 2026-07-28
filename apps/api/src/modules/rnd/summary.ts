import type {
  RndCostLine,
  RndProject,
  RndProjectSummary,
  RndTimeEntry
} from "@finance-taxation/domain-model";

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function buildRndProjectSummary(
  project: RndProject,
  costLines: RndCostLine[],
  timeEntries: RndTimeEntry[]
): RndProjectSummary {
  const projectCostLines = costLines.filter((item) => item.projectId === project.id);
  const projectTimeEntries = timeEntries.filter((item) => item.projectId === project.id);

  const expenseAmount = projectCostLines
    .filter((item) => item.accountingTreatment === "expensed")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const capitalizedAmount = projectCostLines
    .filter((item) => item.accountingTreatment === "capitalized")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalHours = projectTimeEntries
    .reduce((sum, item) => sum + Number(item.hours || 0), 0);

  return {
    projectId: project.id,
    expenseAmount: formatAmount(expenseAmount),
    capitalizedAmount: formatAmount(capitalizedAmount),
    totalHours: formatAmount(totalHours),
    /**
     * 当期加计扣除基数**只含费用化部分**，不含资本化部分。
     *
     * 政策依据：财政部、税务总局公告 2023 年第 7 号 —— 未形成无形资产的按实际
     * 发生额加计 100% 在当期扣除；**已形成无形资产的按成本 200% 摊销**。
     * 资本化部分同样享受优惠，但通过以后各期的摊销分期实现，不在当期一次性
     * 计入基数 —— 把它加进来会让当期优惠被高估。
     *
     * 前端曾自造过「费用化 + 资本化 × 0.6」的口径，那个 0.6 在政策与本模块里
     * 都没有出处，已随 V10c 移除。
     */
    superDeductionEligibleBase: formatAmount(expenseAmount)
  };
}
