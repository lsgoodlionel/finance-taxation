import type { RiskFinding } from "@finance-taxation/domain-model";

const severityBase: Record<NonNullable<RiskFinding["severity"]>, number> = {
  high: 90,
  medium: 60,
  low: 30
};

const ruleBonus: Record<string, number> = {
  SALES_WITHOUT_VAT_ITEM: 10,
  PAYROLL_WITHOUT_IIT_ITEM: 8,
  PAYROLL_WITHOUT_SOCIAL_OBLIGATION: 8,
  PAYROLL_WITHOUT_HOUSING_FUND_SUPPORT: 6,
  POSTED_VOUCHER_WITHOUT_DOCUMENT: 8,
  RND_EVENT_WITHOUT_PROJECT: 8,
  OVERDUE_BLOCKED_TASK: 4,
  TAX_ITEM_WITHOUT_BATCH: 4
};

function priorityForScore(score: number): "P1" | "P2" | "P3" {
  if (score >= 90) return "P1";
  if (score >= 60) return "P2";
  return "P3";
}

export function scoreRiskFindings(findings: RiskFinding[]): RiskFinding[] {
  return findings.map((finding) => {
    const score = Math.min(100, severityBase[finding.severity] + (ruleBonus[finding.ruleCode] || 0));
    return {
      ...finding,
      score,
      priority: priorityForScore(score)
    };
  });
}
