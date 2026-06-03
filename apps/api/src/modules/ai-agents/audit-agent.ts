/**
 * P6-A4 审计/勾稽 Agent（规则优先，可留痕）
 * 汇总审计相关信号，产出风险等级、异常解释草稿与抽样建议。
 */

export interface AuditSignals {
  openHigh: number;        // 高危风险发现
  openMedium: number;
  openLow: number;
  draftVouchers: number;   // 未过账凭证
  unmatchedStatements: number; // 未对账流水
  postedVouchers: number;  // 已过账凭证总数（用于抽样基数）
}

export interface AuditReview {
  riskLevel: "high" | "medium" | "low" | "clean";
  findings: string[];
  sampleSize: number;
  recommendation: string;
}

function clampSample(posted: number): number {
  if (posted <= 0) return 0;
  // 抽样 10%，下限 3，上限 30
  return Math.min(30, Math.max(3, Math.ceil(posted * 0.1)));
}

export function buildAuditReview(s: AuditSignals): AuditReview {
  const findings: string[] = [];
  if (s.openHigh > 0) findings.push(`${s.openHigh} 项高危风险未关闭`);
  if (s.openMedium > 0) findings.push(`${s.openMedium} 项中危风险未关闭`);
  if (s.draftVouchers > 0) findings.push(`${s.draftVouchers} 张凭证未过账，账务未完整`);
  if (s.unmatchedStatements > 0) findings.push(`${s.unmatchedStatements} 笔银行流水未对账`);
  if (s.openLow > 0) findings.push(`${s.openLow} 项低危提示待复核`);

  const riskLevel: AuditReview["riskLevel"] =
    s.openHigh > 0 ? "high"
    : (s.openMedium > 0 || s.draftVouchers > 0 || s.unmatchedStatements > 0) ? "medium"
    : s.openLow > 0 ? "low"
    : "clean";

  const sampleSize = clampSample(s.postedVouchers);
  const recommendation =
    riskLevel === "clean"
      ? `未发现明显异常，建议按 ${sampleSize} 张已过账凭证做常规抽查。`
      : `存在 ${findings.length} 类待处理项，建议优先处置高/中危后，对 ${sampleSize} 张凭证抽查并留存稽核底稿。`;

  return { riskLevel, findings, sampleSize, recommendation };
}
