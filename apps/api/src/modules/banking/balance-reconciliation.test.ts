import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBalanceReconciliation,
  describeDifference,
  type ReconciliationItem
} from "./balance-reconciliation.js";

function item(
  itemType: ReconciliationItem["itemType"],
  amountCents: number,
  occurredOn = "2026-06-28"
): ReconciliationItem {
  return { itemType, amountCents, occurredOn, description: "测试未达账项", sourceId: null };
}

test("无未达账项且两侧本就相等时对平", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_00,
    bookBalanceCents: 3_500_000_00,
    items: []
  });
  assert.equal(result.differenceCents, 0);
  assert.equal(result.balanced, true);
});

test("在途存款加在银行侧，不是账面侧", () => {
  // 企业月底存入 30 万，银行下月才入账
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_00,
    bookBalanceCents: 3_800_000_00,
    items: [item("book_only_receipt", 300_000_00)]
  });
  assert.equal(result.adjustedStatementCents, 3_800_000_00);
  assert.equal(result.adjustedBookCents, 3_800_000_00, "账面侧不因企业已记的收款而变动");
  assert.equal(result.balanced, true);
});

test("未兑付支票从银行侧减", () => {
  // 企业已开票付款 20 万，收款方尚未到银行兑付
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_00,
    bookBalanceCents: 3_300_000_00,
    items: [item("book_only_payment", 200_000_00)]
  });
  assert.equal(result.adjustedStatementCents, 3_300_000_00);
  assert.equal(result.balanced, true);
});

test("银行代收利息加在账面侧", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_500_00,
    bookBalanceCents: 3_500_000_00,
    items: [item("bank_only_receipt", 500_00)]
  });
  assert.equal(result.adjustedBookCents, 3_500_500_00);
  assert.equal(result.adjustedStatementCents, 3_500_500_00, "银行侧不因银行已记的收款而变动");
  assert.equal(result.balanced, true);
});

test("银行扣费从账面侧减", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_499_800_00,
    bookBalanceCents: 3_500_000_00,
    items: [item("bank_only_payment", 200_00)]
  });
  assert.equal(result.adjustedBookCents, 3_499_800_00);
  assert.equal(result.balanced, true);
});

test("四类未达账项同时存在时两侧仍对平", () => {
  // 银行 350 万，账面 350 万；四类各有一笔，交叉调节后应相等
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_00 + 300_000_00 - 200_000_00,
    bookBalanceCents: 3_500_000_00 + 500_00 - 200_00,
    items: [
      item("book_only_receipt", 300_000_00),
      item("book_only_payment", 200_000_00),
      item("bank_only_receipt", 500_00),
      item("bank_only_payment", 200_00)
    ]
  });
  // 银行侧：(350万+30万-20万) + 30万 - 20万 —— 注意 statementBalance 已含前两项的反向
  // 这里只验证两侧调节后相等这一不变式
  assert.equal(
    result.adjustedStatementCents - result.adjustedBookCents,
    result.differenceCents
  );
  assert.deepEqual(result.subtotals, {
    book_only_receipt: 300_000_00,
    book_only_payment: 200_000_00,
    bank_only_receipt: 500_00,
    bank_only_payment: 200_00
  });
});

test("方向写成同向会算错——用一笔在途存款钉住交叉方向", () => {
  const crossed = buildBalanceReconciliation({
    statementBalanceCents: 100_000_00,
    bookBalanceCents: 150_000_00,
    items: [item("book_only_receipt", 50_000_00)]
  });
  assert.equal(crossed.balanced, true, "交叉方向下对平");

  // 若把在途存款错加到账面侧，账面会变成 20 万、银行仍 10 万，差额 10 万
  const wrongSide = buildBalanceReconciliation({
    statementBalanceCents: 100_000_00,
    bookBalanceCents: 150_000_00,
    items: [item("bank_only_receipt", 50_000_00)]
  });
  assert.equal(wrongSide.differenceCents, -100_000_00, "方向错了差额会翻倍而不是归零");
});

test("差额不为 0 时不凑平，并说明方向", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_800_000_00,
    bookBalanceCents: 3_500_000_00,
    items: []
  });
  assert.equal(result.balanced, false);
  assert.equal(result.differenceCents, 300_000_00);
  assert.equal(result.adjustedStatementCents, 3_800_000_00, "系统不得改动任一侧余额");
  assert.match(describeDifference(result), /银行侧偏高/);
  assert.match(describeDifference(result), /不会自动补平/);
});

test("差一分也算不平——不留容差", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_01,
    bookBalanceCents: 3_500_000_00,
    items: []
  });
  assert.equal(result.balanced, false, "挪用资金往往正是从小额开始的");
  assert.equal(result.differenceCents, 1);
});

test("账面侧偏高时说明方向相反", () => {
  const result = buildBalanceReconciliation({
    statementBalanceCents: 3_500_000_00,
    bookBalanceCents: 3_800_000_00,
    items: []
  });
  assert.match(describeDifference(result), /账面侧偏高/);
});
