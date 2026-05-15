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
    superDeductionEligibleBase: formatAmount(expenseAmount)
  };
}
