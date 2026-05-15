import type { RndAccountingPolicyReview, RndPolicyGuidance, RndProject } from "@finance-taxation/domain-model";

export function buildRndPolicyGuidance(
  project: RndProject,
  review: RndAccountingPolicyReview,
  eligibleBase: string
): RndPolicyGuidance {
  const subsidyHints = [
    "如申报高新或研发补贴，需准备项目立项、成果说明和研发投入佐证。",
    `当前可选研发加计扣除基数为 ${eligibleBase}。`
  ];
  const policyHints = [
    `项目当前建议口径：${review.recommendedPolicy}`,
    ...review.guidance
  ];
  const riskHints = review.conflicts.length
    ? review.conflicts
    : ["当前未检测到资本化 / 费用化冲突。"];

  return {
    projectId: project.id,
    projectName: project.name,
    subsidyHints,
    policyHints,
    riskHints
  };
}
