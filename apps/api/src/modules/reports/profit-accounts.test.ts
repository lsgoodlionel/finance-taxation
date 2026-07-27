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

test("classifyProfitAccount routes 6-prefixed accounts missing from the chart into expense", () => {
  // 6602 未登记在科目主数据里（种子分录用了表外科目）。旧的硬编码费用前缀表
  // 只有 6601，hasPrefix("6602") 全不匹配 → other → 被 summarizeProfitTotals
  // 静默丢弃。兜底规则要求：6 开头且非收入 → 一律费用。
  assert.equal(classifyProfitAccount("6602"), "expense");
  assert.equal(classifyProfitAccount("6603"), "expense");
  assert.equal(classifyProfitAccount("6999"), "expense");
});

test("classifyProfitAccount follows the chart of accounts for registered sub-accounts", () => {
  // 二级科目在科目主数据里有权威 category，不再依赖前缀表是否列举过
  assert.equal(classifyProfitAccount("6401001"), "expense");
  assert.equal(classifyProfitAccount("6401002"), "expense");
  assert.equal(classifyProfitAccount("6301e01"), "expense");
  assert.equal(classifyProfitAccount("6301e06"), "expense");
  // 未登记的收入子科目走兜底收入前缀，不能掉进费用兜底
  assert.equal(classifyProfitAccount("6001001"), "revenue");
  assert.equal(classifyProfitAccount("6051001"), "revenue");
});

test("classifyProfitAccount keeps balance-sheet and production-cost accounts out of the profit statement", () => {
  // 4001/4101 在科目表里 category = "cost"，但生产成本要先结转到主营业务成本
  // 才进损益，直接计入利润表会重复计量，因此仍归 other（与修复前一致）
  assert.equal(classifyProfitAccount("4001"), "other");
  assert.equal(classifyProfitAccount("4101"), "other");
  assert.equal(classifyProfitAccount("1801001"), "other");
  assert.equal(classifyProfitAccount("22110101"), "other");
});

test("summarizeProfitTotals no longer drops the 6602 expense recorded in 2026-04", () => {
  // Arrange：复刻 ledger_entries 里 2026-04 的真实费用分录
  const entries = [
    entry("6401", "183000.00", "0.00"),
    entry("6601", "15000.00", "0.00"),
    entry("6602", "8000.00", "0.00")
  ];

  // Act
  const totals = summarizeProfitTotals(entries);

  // Assert：修复前 expense 只有 198000，8000 元管理费用工资凭空消失
  assert.equal(totals.expense, 206000);
  assert.equal(totals.totalProfit, -206000);
  assert.equal(totals.netProfit, -206000);
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

  // expense 不含所得税费用，6801 单独进 incomeTax
  assert.equal(totals.expense, 50);
  assert.equal(totals.incomeTax, 100);
  // 利润总额不扣所得税费用：1000 - 300 - 50 = 650
  assert.equal(totals.totalProfit, 650);
  // 净利润只扣一次所得税费用：650 - 100 = 550
  assert.equal(totals.netProfit, 550);
});

test("summarizeProfitTotals subtracts income tax exactly once", () => {
  // Arrange：同一份数据，仅在是否存在 6801 分录上有差异
  const base = [
    entry("6001", "0.00", "1000.00"),
    entry("6001c", "300.00", "0.00"),
    entry("6601", "50.00", "0.00")
  ];
  const withTax = [...base, entry("6801", "100.00", "0.00")];

  // Act
  const withoutTaxTotals = summarizeProfitTotals(base);
  const withTaxTotals = summarizeProfitTotals(withTax);

  // Assert：所得税费用不影响利润总额，只把净利润拉低正好一次税额
  assert.equal(withTaxTotals.totalProfit, withoutTaxTotals.totalProfit);
  assert.equal(withoutTaxTotals.netProfit - withTaxTotals.netProfit, 100);
  assert.equal(withTaxTotals.netProfit, withTaxTotals.totalProfit - withTaxTotals.incomeTax);
});

test("summarizeProfitTotals keeps pre-fix results when there is no income tax entry", () => {
  // Arrange：无 6801 分录时新旧口径必须逐字段一致（回归保护）
  const entries = [
    entry("6001", "0.00", "1000.00"),
    entry("6051", "0.00", "200.00"),
    entry("6001c", "300.00", "0.00"),
    entry("6301e", "20.00", "0.00"),
    entry("6601", "80.00", "0.00")
  ];

  // Act
  const totals = summarizeProfitTotals(entries);

  // Assert
  assert.equal(totals.incomeTax, 0);
  assert.equal(totals.expense, 100);
  assert.equal(totals.totalProfit, totals.grossProfit - totals.expense);
  assert.equal(totals.netProfit, totals.totalProfit);
  assert.equal(totals.totalProfit, 800);
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
