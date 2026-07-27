import assert from "node:assert/strict";
import test from "node:test";
import { classifyProfitAccount, summarizeProfitTotals } from "./profit-accounts.js";

function entry(accountCode: string, debit: string, credit: string) {
  return { accountCode, debit, credit };
}

test("classifyProfitAccount separates cost and non-operating expense from the revenue prefixes", () => {
  assert.equal(classifyProfitAccount("6001"), "revenue");
  assert.equal(classifyProfitAccount("6051"), "revenue");
  assert.equal(classifyProfitAccount("6111"), "revenue");
  assert.equal(classifyProfitAccount("6301"), "revenue");
  // 与收入前缀重叠但属于成本/支出，必须先被排除
  assert.equal(classifyProfitAccount("6001c"), "cost");
  assert.equal(classifyProfitAccount("6301e"), "expense");
  assert.equal(classifyProfitAccount("6801"), "expense");
  assert.equal(classifyProfitAccount("1002"), "other");
  assert.equal(classifyProfitAccount("2221"), "other");
});

test("summarizeProfitTotals counts every revenue account, not just 6001", () => {
  // Arrange：驾驶舱旧口径只认 accountCode === "6001"，6051 等收入被漏计
  const entries = [
    entry("6001", "0.00", "1000.00"),
    entry("6051", "0.00", "200.00"),
    entry("6001c", "300.00", "0.00"),
    entry("6201", "50.00", "0.00"),
    entry("1002", "1200.00", "0.00")
  ];

  // Act
  const totals = summarizeProfitTotals(entries);

  // Assert
  assert.equal(totals.revenue, 1200);
  assert.equal(totals.cost, 300);
  assert.equal(totals.expense, 50);
  assert.equal(totals.grossProfit, 900);
  assert.equal(totals.totalProfit, 850);
  assert.equal(totals.netProfit, 850);
});

test("summarizeProfitTotals splits income tax out of the expense bucket", () => {
  const entries = [
    entry("6001", "0.00", "1000.00"),
    entry("6001c", "300.00", "0.00"),
    entry("6301e", "50.00", "0.00"),
    entry("6801", "100.00", "0.00")
  ];

  const totals = summarizeProfitTotals(entries);

  assert.equal(totals.expense, 150);
  assert.equal(totals.incomeTax, 100);
  assert.equal(totals.totalProfit, 550);
  assert.equal(totals.netProfit, 450);
});

test("summarizeProfitTotals ignores balance-sheet accounts and returns zeros for empty input", () => {
  assert.deepEqual(summarizeProfitTotals([]), {
    revenue: 0,
    cost: 0,
    expense: 0,
    incomeTax: 0,
    grossProfit: 0,
    totalProfit: 0,
    netProfit: 0
  });

  const totals = summarizeProfitTotals([entry("1002", "500.00", "0.00"), entry("2221", "0.00", "500.00")]);
  assert.equal(totals.revenue, 0);
  assert.equal(totals.netProfit, 0);
});
