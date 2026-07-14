/**
 * H1 草稿提案纯核心（draft-then-approve）。
 *
 * 把「会计建议（accounting-agent）+ 自动化决策门（governance）」组合为一份
 * 「草稿提案」：AI 只产草稿，绝不直接入账。金额与借贷平衡校验在此以整数分
 * 硬编码校验，不交给 LLM/规则引擎判断——这是本模块存在的核心原因。
 *
 * 关键不变量（务必保持）：
 * 1. 本函数是纯函数：不读写数据库、不发网络请求、不产生副作用。
 * 2. `level` 永远只描述「草稿本身可否被自动生成/采纳」，即使 `level === "auto"`，
 *    产出仍然只是一份草稿（DraftProposal），入账（过账/写凭证）必须经过后续的人工
 *    批准流程；本模块不提供、也不应提供任何入账能力。
 * 3. 只要借贷不平衡、AI 建议自身标记需复核、或分录为空，`level` 会被无条件强制
 *    降级为 "manual"，即使 governance 的 decideAutomation 给出了更高级别。
 */

import {
  suggestAccountingEntry,
  type EventForAccounting,
  type AccountingSuggestion
} from "../accounting-agent.js";
import {
  decideAutomation,
  type AutomationLevel,
  type AutomationThresholds
} from "../governance.js";
import type { VoucherDraftLine } from "@finance-taxation/domain-model";

export interface DraftProposalOptions {
  /** 覆盖自动化决策门的阈值（分级自动化，见 governance.ts）。 */
  autoThresholds?: Partial<AutomationThresholds>;
}

export interface DraftProposal {
  /** 最终分级：auto（可自动生成草稿）/ suggest（供人工采纳）/ manual（必须人工处理）。 */
  level: AutomationLevel;
  /** 借贷是否平衡（以分为单位整数比较，硬校验，不交给 LLM）。 */
  balanced: boolean;
  /** 借方合计（分）。 */
  sumDebitCents: number;
  /** 贷方合计（分）。 */
  sumCreditCents: number;
  /** 会计建议给出的分录明细（原样透传，未落库）。 */
  lines: VoucherDraftLine[];
  /** 命中的凭证模板 key；无法匹配模板时为 null。 */
  templateKey: string | null;
  /** 会计建议的判断依据（人类可读）。 */
  rationale: string;
  /** 触发强制人工降级的原因列表；为空数组表示未触发强制降级。 */
  blockingReasons: string[];
}

/**
 * 把形如 "123.45" / "0.00" 的两位小数金额字符串安全转换为整数分。
 * 解析失败（格式非法）时返回 null，调用方需按「不可信」处理，不得当作 0 静默放行。
 */
function parseDecimalToCents(value: string): number | null {
  const trimmed = value.trim();
  const isValidDecimal = /^-?\d+(\.\d{1,2})?$/.test(trimmed);
  if (!isValidDecimal) {
    return null;
  }
  const isNegative = trimmed.startsWith("-");
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const centsFraction = (fractionPart + "00").slice(0, 2);
  const cents = Number(integerPart) * 100 + Number(centsFraction);
  return isNegative ? -cents : cents;
}

interface LineSumResult {
  sumDebitCents: number;
  sumCreditCents: number;
  /** 只要有一行金额格式非法，即视为不可信，强制不平衡处理。 */
  hasUnparsableAmount: boolean;
}

function sumLineCents(lines: readonly VoucherDraftLine[]): LineSumResult {
  return lines.reduce<LineSumResult>(
    (acc, currentLine) => {
      const debitCents = parseDecimalToCents(currentLine.debit);
      const creditCents = parseDecimalToCents(currentLine.credit);
      if (debitCents === null || creditCents === null) {
        return { ...acc, hasUnparsableAmount: true };
      }
      return {
        sumDebitCents: acc.sumDebitCents + debitCents,
        sumCreditCents: acc.sumCreditCents + creditCents,
        hasUnparsableAmount: acc.hasUnparsableAmount
      };
    },
    { sumDebitCents: 0, sumCreditCents: 0, hasUnparsableAmount: false }
  );
}

function collectBlockingReasons(
  suggestion: AccountingSuggestion,
  balanced: boolean,
  hasUnparsableAmount: boolean
): string[] {
  const reasons: string[] = [];
  if (hasUnparsableAmount) {
    reasons.push("分录金额格式非法，无法校验借贷平衡，强制人工处理。");
  } else if (!balanced) {
    reasons.push("借贷合计不平衡（硬校验），强制人工处理，不采纳自动/建议分级。");
  }
  if (suggestion.lines.length === 0) {
    reasons.push("会计建议未产出任何分录，强制人工处理。");
  }
  if (suggestion.needsReview) {
    reasons.push("会计建议自身标记需人工复核，强制人工处理。");
  }
  return reasons;
}

/**
 * 对一份「已产出的会计建议」套用硬校验 + 自动化决策门，产出草稿提案。
 *
 * 拆成独立的可导出函数（而非内联在 buildDraftProposal 里）是刻意的测试设计：
 * 当前 accounting-agent.ts 的 suggestAccountingEntry 对所有分支都无条件返回
 * needsReview: true（见其源码），因此经由真实事项永远无法观察到「不平衡」
 * 或「needsReview=false」这两条分支——单测需要能直接构造 AccountingSuggestion
 * 来覆盖这些分支，而不必（也不应该）修改 accounting-agent.ts 本身。
 *
 * 不写库、不入账、无副作用。`level === "auto"` 仅表示可自动生成草稿，
 * 后续过账仍必须经过人工批准；且由于本函数始终把 isFinancialMutation
 * 设为 true（见 buildDraftProposal），governance 的分级自动化门在结构上
 * 永远不会对财务写账类建议放行 "auto"——这是刻意的业务约束，不是缺陷。
 */
export function buildDraftProposalFromSuggestion(
  suggestion: AccountingSuggestion,
  opts?: DraftProposalOptions
): DraftProposal {
  const { sumDebitCents, sumCreditCents, hasUnparsableAmount } = sumLineCents(suggestion.lines);
  const balanced = !hasUnparsableAmount && sumDebitCents === sumCreditCents;

  const decision = decideAutomation({
    ruleConfidence: suggestion.confidence,
    isFinancialMutation: true,
    amountCents: Math.max(sumDebitCents, sumCreditCents),
    thresholds: opts?.autoThresholds
  });

  const blockingReasons = collectBlockingReasons(suggestion, balanced, hasUnparsableAmount);
  const level: AutomationLevel = blockingReasons.length > 0 ? "manual" : decision.level;

  return {
    level,
    balanced,
    sumDebitCents,
    sumCreditCents,
    lines: suggestion.lines,
    templateKey: suggestion.templateKey,
    rationale: suggestion.rationale,
    blockingReasons
  };
}

/**
 * 组合会计建议 + 自动化决策门，产出一份「草稿提案」。
 *
 * 不写库、不入账、无副作用。`level === "auto"` 仅表示可自动生成草稿，
 * 后续过账仍必须经过人工批准。
 */
export function buildDraftProposal(
  event: EventForAccounting,
  opts?: DraftProposalOptions
): DraftProposal {
  const suggestion = suggestAccountingEntry(event);
  return buildDraftProposalFromSuggestion(suggestion, opts);
}
