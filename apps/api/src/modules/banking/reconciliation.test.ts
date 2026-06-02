import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMatchScore,
  DEFAULT_RULES,
  type BankStmt,
  type VoucherCandidate,
} from "./reconciliation.js";

function makeStmt(overrides: Partial<BankStmt> = {}): BankStmt {
  return {
    id: "bs-1",
    transaction_date: "2026-05-10",
    amount: "1000.00",
    counterparty_name: null,
    counterparty_no: null,
    description: null,
    ...overrides,
  };
}

function makeVoucher(overrides: Partial<VoucherCandidate> = {}): VoucherCandidate {
  return {
    id: "v-1",
    total_debit: "1000.00",
    created_at: "2026-05-10T00:00:00.000Z",
    summary: "",
    ...overrides,
  };
}

test("computeMatchScore awards full marks for exact amount and same-day match", () => {
  // Arrange
  const stmt = makeStmt();
  const voucher = makeVoucher();

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 金额完全匹配(50) + 日期一致(30) = 80
  assert.equal(result.score, 80);
  assert.equal(result.amountDiff, 0);
  assert.equal(result.dateDiffDays, 0);
  assert.ok(result.reasons.includes("金额完全匹配"));
  assert.ok(result.reasons.includes("日期一致"));
});

test("computeMatchScore reaches auto-confirm threshold with keyword and counterparty bonus", () => {
  // Arrange
  const stmt = makeStmt({ description: "工资代发", counterparty_name: "张三劳务" });
  const voucher = makeVoucher({ summary: "张三劳务工资" });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 50 + 30 + 关键词(cap20) + 对方名称bonus(10) = 100
  assert.ok(result.score >= DEFAULT_RULES.autoConfirmThreshold);
  assert.ok(result.reasons.some((r) => r.includes("工资")));
  assert.ok(result.reasons.includes("对方名称与凭证摘要相符"));
});

test("computeMatchScore degrades amount score outside tolerance", () => {
  // Arrange
  const stmt = makeStmt({ amount: "1050.00" });
  const voucher = makeVoucher({ total_debit: "1000.00" });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 金额差50→部分分(15) + 日期一致(30) = 45
  assert.equal(result.amountDiff, 50);
  assert.equal(result.score, 45);
  assert.ok(!result.reasons.includes("金额完全匹配"));
});

test("computeMatchScore reduces date score as gap widens", () => {
  // Arrange
  const stmt = makeStmt({ transaction_date: "2026-05-13" });
  const voucher = makeVoucher({ created_at: "2026-05-10T00:00:00.000Z" });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 金额(50) + 3天(15) = 65
  assert.equal(result.dateDiffDays, 3);
  assert.equal(result.score, 65);
});

test("computeMatchScore treats negative statement amount by absolute value", () => {
  // Arrange: 付款流水为负数
  const stmt = makeStmt({ amount: "-1000.00" });
  const voucher = makeVoucher({ total_debit: "1000.00" });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert
  assert.equal(result.amountDiff, 0);
  assert.equal(result.score, 80);
});

test("computeMatchScore caps total at 100", () => {
  // Arrange
  const stmt = makeStmt({ description: "工资 薪资 代发 货款", counterparty_name: "回款付款公司" });
  const voucher = makeVoucher({ summary: "回款付款公司 工资 薪资 代发" });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert
  assert.ok(result.score <= 100);
});
