// Unit tests for validation-hints — no DOM required
import {
  buildValidationHints,
  describeBalanceGap,
  VALIDATION_GUIDE_ITEMS,
  type ValidationHintInput,
} from "./validation-hints";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── describeBalanceGap ───────────────────────────────────────────────────────

const debitHeavy = describeBalanceGap(1000, 800);
ok(debitHeavy !== null, "debit > credit should produce a gap hint");
ok(debitHeavy.problem.includes("借方合计 ¥1000.00"), "gap hint shows debit total");
ok(debitHeavy.problem.includes("贷方合计 ¥800.00"), "gap hint shows credit total");
ok(debitHeavy.problem.includes("差额 ¥200.00"), "gap hint shows diff");
ok(debitHeavy.problem.includes("贷方少 ¥200.00"), "debit heavy means credit side is short");

const creditHeavy = describeBalanceGap(500, 650.5);
ok(creditHeavy !== null, "credit > debit should produce a gap hint");
ok(creditHeavy.problem.includes("差额 ¥150.50"), "gap hint shows fractional diff");
ok(creditHeavy.problem.includes("借方少 ¥150.50"), "credit heavy means debit side is short");

ok(describeBalanceGap(1000, 1000) === null, "balanced totals produce no gap hint");
ok(describeBalanceGap(1000, 1000.001) === null, "diff within epsilon is treated as balanced");

// ─── buildValidationHints: balanced & valid ───────────────────────────────────

const validInput: ValidationHintInput = {
  valid: true,
  totals: { debit: "1000.00", credit: "1000.00" },
  issues: [],
  lines: [
    { accountCode: "1001", accountName: "库存现金", debit: "1000.00", credit: "0" },
    { accountCode: "6001", accountName: "主营业务收入", debit: "0", credit: "1000.00" },
  ],
};
ok(buildValidationHints(validInput).length === 0, "valid voucher yields no hints");

// ─── buildValidationHints: debit > credit ─────────────────────────────────────

const debitHeavyHints = buildValidationHints({
  valid: false,
  totals: { debit: "1000.00", credit: "800.00" },
  issues: ["借贷不平，借方 1000.00，贷方 800.00"],
});
ok(debitHeavyHints.length === 1, "unbalanced voucher yields exactly one hint (backend text deduped)");
ok(debitHeavyHints[0]?.problem.includes("贷方少 ¥200.00"), "hint tells which side is short");
ok(debitHeavyHints[0]?.advice.includes("金额输错或漏记一行分录"), "hint gives common cause");

// ─── buildValidationHints: credit > debit ─────────────────────────────────────

const creditHeavyHints = buildValidationHints({
  valid: false,
  totals: { debit: "300.00", credit: "500.00" },
  issues: ["借贷不平，借方 300.00，贷方 500.00"],
});
ok(creditHeavyHints.length === 1, "credit heavy yields one hint");
ok(creditHeavyHints[0]?.problem.includes("借方少 ¥200.00"), "credit heavy hint points to debit side");

// ─── buildValidationHints: empty lines ────────────────────────────────────────

const emptyLinesHints = buildValidationHints({
  valid: false,
  totals: { debit: "0.00", credit: "0.00" },
  issues: ["凭证分录为空"],
  lines: [],
});
ok(emptyLinesHints.length === 1, "empty voucher yields one hint");
ok(emptyLinesHints[0]?.problem === "凭证没有任何分录", "empty voucher problem text");
ok(emptyLinesHints[0]?.advice.includes("至少一借一贷"), "empty voucher advice explains fix");

// ─── buildValidationHints: missing account with row numbers ───────────────────

const missingAccountHints = buildValidationHints({
  valid: false,
  totals: { debit: "1000.00", credit: "1000.00" },
  issues: ["存在未填写完整科目的分录"],
  lines: [
    { accountCode: "1001", accountName: "库存现金", debit: "1000.00", credit: "0" },
    { accountCode: "", accountName: "", debit: "0", credit: "600.00" },
    { accountCode: "6001", accountName: "", debit: "0", credit: "400.00" },
  ],
});
ok(missingAccountHints.length === 1, "missing account yields one hint");
ok(missingAccountHints[0]?.problem === "第 2、3 行分录缺少会计科目", "hint pinpoints the rows");
ok(missingAccountHints[0]?.advice.includes("科目编码"), "hint says how to fix missing account");

// Without lines the hint falls back to the generic problem text
const missingAccountNoLines = buildValidationHints({
  valid: false,
  totals: { debit: "100.00", credit: "100.00" },
  issues: ["存在未填写完整科目的分录"],
});
ok(missingAccountNoLines[0]?.problem === "存在未填写完整科目的分录", "no lines falls back to generic text");

// ─── buildValidationHints: empty amount rows ──────────────────────────────────

const emptyAmountHints = buildValidationHints({
  valid: false,
  totals: { debit: "1000.00", credit: "800.00" },
  issues: [],
  lines: [
    { accountCode: "1001", accountName: "库存现金", debit: "1000.00", credit: "0" },
    { accountCode: "6001", accountName: "主营业务收入", debit: "0", credit: "800.00" },
    { accountCode: "2221", accountName: "应交税费", debit: "0", credit: "0" },
  ],
});
ok(emptyAmountHints.length === 2, "gap + empty-amount row yields two hints");
ok(
  emptyAmountHints.some((hint) => hint.problem.includes("第 3 行借贷金额均为 0")),
  "empty amount hint pinpoints the row"
);

// ─── buildValidationHints: unknown issue passthrough ──────────────────────────

const unknownHints = buildValidationHints({
  valid: false,
  totals: { debit: "100.00", credit: "100.00" },
  issues: ["凭证日期不在开放期间"],
});
ok(unknownHints.length === 1, "unknown issue passes through as one hint");
ok(unknownHints[0]?.problem === "凭证日期不在开放期间", "unknown issue keeps original text");
ok(unknownHints[0]?.advice.includes("重新执行借贷校验"), "unknown issue gets fallback advice");

// ─── static guide items for the create modal ──────────────────────────────────

ok(VALIDATION_GUIDE_ITEMS.length >= 3, "guide items cover the common failure classes");
ok(
  VALIDATION_GUIDE_ITEMS.every((item) => item.problem.length > 0 && item.advice.length > 0),
  "every guide item has problem and advice"
);
