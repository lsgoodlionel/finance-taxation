/**
 * V7 L3 校验失败修复建议：把 validateVoucher 的干巴巴结果
 * 转成「差在哪 + 怎么修」的结构化提示。纯函数，无 UI 依赖。
 */

export interface ValidationLineInput {
  accountCode?: string;
  accountName?: string;
  debit: string | number;
  credit: string | number;
}

export interface ValidationHintInput {
  valid: boolean;
  totals: { debit: string; credit: string };
  issues: readonly string[];
  lines?: readonly ValidationLineInput[];
}

export interface ValidationHint {
  key: string;
  /** 差在哪：一句话描述问题。 */
  problem: string;
  /** 怎么修：一句话修复建议。 */
  advice: string;
}

/** 借贷金额比较的容差（元）。 */
const BALANCE_EPSILON = 0.005;

const BALANCE_ADVICE = "常见原因：某行金额输错或漏记一行分录，请逐行核对金额并补齐差额后重新校验。";
const EMPTY_LINES_ADVICE = "请按模板重新生成或补充分录（至少一借一贷两行），再执行借贷校验。";
const MISSING_ACCOUNT_ADVICE = "请为缺科目的分录补齐科目编码和会计科目名称后重新校验。";
const EMPTY_AMOUNT_ADVICE = "请填写该行的借方或贷方金额；若是多余空行，请删除后重新校验。";
const FALLBACK_ADVICE = "请按提示修正分录后重新执行借贷校验。";

/** 建单 Modal 用的静态指引：校验最常见的三类失败与修法。 */
export const VALIDATION_GUIDE_ITEMS: readonly { problem: string; advice: string }[] = [
  { problem: "借贷不平", advice: "多为金额输错或漏行，核对每行借贷金额并补齐差额" },
  { problem: "分录缺科目", advice: "为每行分录补齐科目编码与会计科目名称" },
  { problem: "分录缺金额 / 空行", advice: "填写借方或贷方金额，多余空行直接删除" },
];

function toAmount(value: string | number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

/** 借贷差额描述：返回 null 表示已平衡。 */
export function describeBalanceGap(debitTotal: number, creditTotal: number): ValidationHint | null {
  const gap = debitTotal - creditTotal;
  if (Math.abs(gap) <= BALANCE_EPSILON) return null;
  const diff = Math.abs(gap);
  const shortSide = gap > 0 ? "贷方少" : "借方少";
  return {
    key: "balance-gap",
    problem: `借方合计 ${formatMoney(debitTotal)}，贷方合计 ${formatMoney(creditTotal)}，差额 ${formatMoney(diff)}（${shortSide} ${formatMoney(diff)}）`,
    advice: BALANCE_ADVICE,
  };
}

function buildMissingAccountHint(lines?: readonly ValidationLineInput[]): ValidationHint {
  const missingRows = (lines ?? [])
    .map((line, index) => ({ line, rowNo: index + 1 }))
    .filter(({ line }) => !line.accountCode || !line.accountName)
    .map(({ rowNo }) => rowNo);
  const problem = missingRows.length > 0
    ? `第 ${missingRows.join("、")} 行分录缺少会计科目`
    : "存在未填写完整科目的分录";
  return { key: "missing-account", problem, advice: MISSING_ACCOUNT_ADVICE };
}

function buildEmptyAmountHints(lines?: readonly ValidationLineInput[]): ValidationHint[] {
  const emptyRows = (lines ?? [])
    .map((line, index) => ({ line, rowNo: index + 1 }))
    .filter(({ line }) => toAmount(line.debit) === 0 && toAmount(line.credit) === 0)
    .map(({ rowNo }) => rowNo);
  if (emptyRows.length === 0) return [];
  return [{
    key: "empty-amount",
    problem: `第 ${emptyRows.join("、")} 行借贷金额均为 0（疑似空行或漏填金额）`,
    advice: EMPTY_AMOUNT_ADVICE,
  }];
}

function isKnownIssue(issue: string): boolean {
  return issue.includes("借贷不平") || issue.includes("分录为空") || issue.includes("科目");
}

/**
 * 根据校验结果（+ 可选分录明细）生成结构化修复建议。
 * 借贷差额优先前端自算（totals 足够），后端的「借贷不平」文案不再重复展示。
 */
export function buildValidationHints(input: ValidationHintInput): ValidationHint[] {
  const debitTotal = toAmount(input.totals.debit);
  const creditTotal = toAmount(input.totals.credit);

  const balanceHint = describeBalanceGap(debitTotal, creditTotal);
  const hasEmptyLinesIssue = input.issues.some((issue) => issue.includes("分录为空"));
  const hasMissingAccountIssue = input.issues.some((issue) => issue.includes("科目"));
  const unknownIssues = input.issues.filter((issue) => !isKnownIssue(issue));

  const hints: ValidationHint[] = [
    ...(hasEmptyLinesIssue
      ? [{ key: "empty-lines", problem: "凭证没有任何分录", advice: EMPTY_LINES_ADVICE }]
      : []),
    ...(balanceHint ? [balanceHint] : []),
    ...(hasMissingAccountIssue ? [buildMissingAccountHint(input.lines)] : []),
    ...(hasEmptyLinesIssue ? [] : buildEmptyAmountHints(input.lines)),
    ...unknownIssues.map((issue, index) => ({
      key: `issue-${index}`,
      problem: issue,
      advice: FALLBACK_ADVICE,
    })),
  ];
  return hints;
}
