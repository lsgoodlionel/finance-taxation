import { test } from "node:test";
import assert from "node:assert/strict";
import { generateClosingEntries, PROFIT_ACCOUNT } from "./closing.js";

// balance = debit - credit (matches reports/summary balanceMap convention):
// revenue accounts carry a net credit (negative balance), expenses a net debit (positive).

test("closes revenue and expense into 本年利润 with a balanced voucher (profit)", () => {
  const result = generateClosingEntries([
    { accountCode: "6001", balance: -1000 }, // revenue: credit 1000
    { accountCode: "6601", balance: 400 } // expense: debit 400
  ]);
  assert.equal(result.netProfit, 600);

  const totalDebit = result.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = result.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit, "voucher must balance");

  const revenue = result.lines.find((l) => l.accountCode === "6001");
  assert.deepEqual({ debit: revenue!.debit, credit: revenue!.credit }, { debit: 1000, credit: 0 });
  const expense = result.lines.find((l) => l.accountCode === "6601");
  assert.deepEqual({ debit: expense!.debit, credit: expense!.credit }, { debit: 0, credit: 400 });
  const profit = result.lines.find((l) => l.accountCode === PROFIT_ACCOUNT);
  assert.deepEqual({ debit: profit!.debit, credit: profit!.credit }, { debit: 0, credit: 600 });
});

test("posts a net loss as a debit to 本年利润", () => {
  const result = generateClosingEntries([
    { accountCode: "6001", balance: -300 },
    { accountCode: "6601", balance: 500 }
  ]);
  assert.equal(result.netProfit, -200);
  const profit = result.lines.find((l) => l.accountCode === PROFIT_ACCOUNT);
  assert.deepEqual({ debit: profit!.debit, credit: profit!.credit }, { debit: 200, credit: 0 });
  const totalDebit = result.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = result.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
});

test("ignores non-profit-and-loss accounts (assets/liabilities/equity)", () => {
  const result = generateClosingEntries([
    { accountCode: "1001", balance: 5000 },
    { accountCode: "2001", balance: -2000 },
    { accountCode: "6001", balance: -1000 }
  ]);
  assert.equal(result.lines.some((l) => l.accountCode === "1001"), false);
  assert.equal(result.lines.some((l) => l.accountCode === "2001"), false);
  assert.equal(result.netProfit, 1000);
});

test("skips accounts with a zero balance", () => {
  const result = generateClosingEntries([
    { accountCode: "6001", balance: -1000 },
    { accountCode: "6051", balance: 0 }
  ]);
  assert.equal(result.lines.some((l) => l.accountCode === "6051"), false);
});

test("returns no lines when there is no profit or loss activity", () => {
  const result = generateClosingEntries([{ accountCode: "1001", balance: 100 }]);
  assert.equal(result.lines.length, 0);
  assert.equal(result.netProfit, 0);
});

test("treats all four revenue prefixes as revenue and the rest of 6xxx as expense", () => {
  const result = generateClosingEntries([
    { accountCode: "6001", balance: -100 },
    { accountCode: "6051", balance: -50 },
    { accountCode: "6111", balance: -30 },
    { accountCode: "6301", balance: -20 },
    { accountCode: "6602", balance: 40 }
  ]);
  // revenue total 200, expense 40 → net 160
  assert.equal(result.netProfit, 160);
  const profit = result.lines.find((l) => l.accountCode === PROFIT_ACCOUNT);
  assert.equal(profit!.credit, 160);
});
