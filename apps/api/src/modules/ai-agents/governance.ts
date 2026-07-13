/**
 * AI 治理：分级自动化决策门（D5）。
 *
 * 落地蓝图的分级自动化：规则引擎兜底 + LLM 建议 + 人工最终确认。纯函数，
 * 决定某个 AI/规则产出应当「自动执行 / 作为建议 / 强制人工」。硬约束：
 * 超过金额上限的财务变更永远走人工——金额/借贷平衡等绝不交给 LLM。
 */

export type AutomationLevel = "auto" | "suggest" | "manual";

export interface AutomationThresholds {
  /** rule 置信度 ≥ 此值可自动执行。 */
  autoMin: number;
  /** 置信度 ≥ 此值可作为建议。 */
  suggestMin: number;
  /** 财务变更金额（分）超过此上限强制人工。 */
  financialCapCents: number;
}

export const DEFAULT_THRESHOLDS: AutomationThresholds = {
  autoMin: 0.9,
  suggestMin: 0.6,
  financialCapCents: 1_000_000 // 1 万元
};

export interface AutomationInput {
  /** 规则引擎置信度 0–1。 */
  ruleConfidence: number;
  /** 是否为写账/财务金额类变更。 */
  isFinancialMutation: boolean;
  /** 涉及金额（分），财务变更时用于与上限比较。 */
  amountCents?: number;
  thresholds?: Partial<AutomationThresholds>;
}

export interface AutomationDecision {
  level: AutomationLevel;
  reason: string;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function decideAutomation(input: AutomationInput): AutomationDecision {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const confidence = clampConfidence(input.ruleConfidence);

  if (input.isFinancialMutation && (input.amountCents ?? 0) > thresholds.financialCapCents) {
    return {
      level: "manual",
      reason: `财务变更金额超过上限（${thresholds.financialCapCents} 分），强制人工确认`
    };
  }

  if (confidence >= thresholds.autoMin && !input.isFinancialMutation) {
    return { level: "auto", reason: `规则置信度 ${confidence} ≥ ${thresholds.autoMin}，非财务变更，可自动执行` };
  }

  if (confidence >= thresholds.suggestMin) {
    return { level: "suggest", reason: `置信度 ${confidence} ≥ ${thresholds.suggestMin}，作为建议供人工采纳` };
  }

  return { level: "manual", reason: `置信度 ${confidence} 低于建议阈值 ${thresholds.suggestMin}，需人工处理` };
}
