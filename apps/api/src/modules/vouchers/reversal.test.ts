/**
 * 红冲（反向凭证）的裁决与分录生成。
 *
 * 这两件事都是纯函数，与 DB 无关，因此单独成模块单独测 —— 红冲一旦算错，
 * 错的是账，且因为它本身也要过账，错误会立刻落进总账。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildReversalLines, canReverseVoucher } from "./reversal.js";

const POSTED = {
  status: "posted" as const,
  postedAt: "2026-07-01T00:00:00.000Z",
  reversesVoucherId: null,
  alreadyReversed: false
};

test("a posted voucher that has not been reversed can be reversed", () => {
  // Act
  const verdict = canReverseVoucher(POSTED);

  // Assert
  assert.equal(verdict.ok, true);
});

test("an unposted voucher cannot be reversed — there is nothing in the ledger yet", () => {
  // Arrange: 草稿与待审核都还没进总账，改它本身就够了，不该用红冲
  for (const status of ["draft", "review_required"] as const) {
    // Act
    const verdict = canReverseVoucher({ ...POSTED, status, postedAt: null });

    // Assert
    assert.equal(verdict.ok, false, `${status} 不应可红冲`);
    assert.equal(verdict.errorCode, "VOUCHER_NOT_POSTED");
  }
});

test("a voucher cannot be reversed twice", () => {
  // Arrange: 重复红冲会把账冲成反方向，等于凭空造一笔业务
  const verdict = canReverseVoucher({ ...POSTED, alreadyReversed: true });

  // Assert
  assert.equal(verdict.ok, false);
  assert.equal(verdict.errorCode, "VOUCHER_ALREADY_REVERSED");
});

test("a reversal voucher cannot itself be reversed", () => {
  // Arrange: 红冲的红冲等于恢复原分录，会绕过「已过账不得改写」的约束；
  // 真要恢复应当重新做一张正向凭证并走审核过账，留下完整痕迹。
  const verdict = canReverseVoucher({ ...POSTED, reversesVoucherId: "vch-original" });

  // Assert
  assert.equal(verdict.ok, false);
  assert.equal(verdict.errorCode, "VOUCHER_IS_REVERSAL");
});

test("reversal lines swap debit and credit while keeping every other field", () => {
  // Arrange
  const lines = [
    { summary: "银行付款", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "100.00" },
    { summary: "办公费", accountCode: "6601", accountName: "管理费用", debit: "100.00", credit: "0.00" }
  ];

  // Act
  const reversed = buildReversalLines(lines);

  // Assert: 借贷对调，科目与摘要原样保留
  assert.deepEqual(reversed, [
    { summary: "银行付款", accountCode: "1002", accountName: "银行存款", debit: "100.00", credit: "0.00" },
    { summary: "办公费", accountCode: "6601", accountName: "管理费用", debit: "0.00", credit: "100.00" }
  ]);
});

test("reversal lines keep the voucher balanced", () => {
  // Arrange: 原凭证配平，红冲后必须仍然配平 —— 否则红冲自己都过不了账
  const lines = [
    { summary: "a", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "150.50" },
    { summary: "b", accountCode: "6601", accountName: "管理费用", debit: "100.50", credit: "0.00" },
    { summary: "c", accountCode: "6602", accountName: "财务费用", debit: "50.00", credit: "0.00" }
  ];

  // Act
  const reversed = buildReversalLines(lines);

  // Assert
  const debit = reversed.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = reversed.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(debit, 150.5);
  assert.equal(credit, 150.5);
});

test("reversal preserves decimal precision instead of round-tripping through Number", () => {
  // Arrange: 金额是字符串存的，走一趟 Number 会把 "100.00" 变成 "100"，
  // 前端按字符串直出时就会出现同一张凭证两种写法。
  const lines = [
    { summary: "a", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "1000.00" }
  ];

  // Act
  const reversed = buildReversalLines(lines);

  // Assert
  assert.equal(reversed[0]?.debit, "1000.00");
  assert.equal(reversed[0]?.credit, "0.00");
});
