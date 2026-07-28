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

/**
 * 这三个用例存在的理由：上面所有夹具都把 `created_at` 喂成**字符串**，
 * 而生产从 pg 拿到的是 **Date** —— `timestamptz` 没有注册返回字符串的类型解析器
 * （只有 `date` 列有，见 db/date-column.ts）。类型声明当时写的是 `string`，
 * TS 不报错，于是 `created_at.slice(0, 10)` 在生产必然抛 TypeError，
 * 整条自动对账链路失效，而单测全绿。
 *
 * 因此这里刻意用 Date 入参：夹具类型与真实取数一致，才是有效覆盖。
 */
test("computeMatchScore accepts a Date created_at, matching what node-postgres actually returns", () => {
  // Arrange: 与「日期一致」用例同一天，但按生产的真实类型传入
  const stmt = makeStmt({ transaction_date: "2026-05-10" });
  const voucher = makeVoucher({ created_at: new Date("2026-05-10T00:00:00.000Z") });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 不抛异常，且与字符串入参得到完全相同的结果
  assert.equal(result.dateDiffDays, 0);
  assert.equal(result.score, 80);
  assert.ok(result.reasons.includes("日期一致"));
});

test("computeMatchScore scores a Date created_at identically to its string form", () => {
  // Arrange
  const stmt = makeStmt({ transaction_date: "2026-05-13" });
  const iso = "2026-05-10T00:00:00.000Z";

  // Act
  const fromString = computeMatchScore(stmt, makeVoucher({ created_at: iso }), DEFAULT_RULES);
  const fromDate = computeMatchScore(stmt, makeVoucher({ created_at: new Date(iso) }), DEFAULT_RULES);

  // Assert: 两种入参形态不得产生任何评分差异
  assert.deepEqual(fromDate, fromString);
});

test("computeMatchScore gives no date score when the voucher date is unusable", () => {
  // Arrange: 无效日期不应伪造「日期一致」，也不应让分数变成 NaN
  const stmt = makeStmt({ transaction_date: "2026-05-10" });
  const voucher = makeVoucher({ created_at: new Date("invalid") });

  // Act
  const result = computeMatchScore(stmt, voucher, DEFAULT_RULES);

  // Assert: 只剩金额分，日期差为 null 而非 NaN
  assert.equal(result.dateDiffDays, null);
  assert.equal(result.score, 50);
  assert.ok(!result.reasons.includes("日期一致"));
});
