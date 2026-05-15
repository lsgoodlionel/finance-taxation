import type {
  RndAccountingPolicyReview,
  RndCostLine,
  RndProject,
  RndTimeEntry
} from "@finance-taxation/domain-model";

export function buildRndAccountingPolicyReview(
  project: RndProject,
  costLines: RndCostLine[],
  timeEntries: RndTimeEntry[]
): RndAccountingPolicyReview {
  const conflicts: string[] = [];
  if (project.capitalizationPolicy === "expense") {
    for (const line of costLines) {
      if (line.accountingTreatment === "capitalized") {
        conflicts.push(`成本 ${line.id} 已资本化，但项目口径为费用化。`);
      }
    }
  }
  if (project.capitalizationPolicy === "capitalize") {
    for (const line of costLines) {
      if (line.accountingTreatment === "expensed") {
        conflicts.push(`成本 ${line.id} 已费用化，但项目口径为资本化。`);
      }
    }
  }

  const guidance = [
    `当前项目口径：${project.capitalizationPolicy}`,
    `已归集成本 ${costLines.length} 条，工时 ${timeEntries.length} 条。`,
    "资本化前应补齐阶段成果、可行性依据和形成无形资产的支持资料。"
  ];

  return {
    projectId: project.id,
    projectName: project.name,
    recommendedPolicy: project.capitalizationPolicy,
    conflicts,
    guidance
  };
}
