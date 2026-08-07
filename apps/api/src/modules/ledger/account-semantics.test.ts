/**
 * 科目语义规则（V12-B4 / B5）。
 *
 * 这些判定决定「哪些科目不能有期初余额」。判错的后果是双向的：
 * 判宽了 → 用户把收入录成期初余额，本年度利润凭空多一块；
 * 判严了 → 制造业录不进在产品期初余额，期初资产负债表直接不平。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_YEAR_PROFIT_TYPE,
  isProfitAndLossAccountType,
  rejectOpeningBalance,
  describeOpeningBalanceRejection,
  RETAINED_EARNINGS_CODE
} from "./account-semantics.js";

test("收入与费用家族一律判为损益类", () => {
  for (const type of [
    "income",
    "income_other",
    "expense",
    "expense_direct_cost",
    "expense_tax",
    "expense_tax_surcharge",
    "expense_depreciation",
    "expense_finance",
    "expense_other"
  ]) {
    assert.equal(isProfitAndLossAccountType(type), true, `${type} 应判为损益类`);
  }
});

test("用户自建的 income_*/expense_* 子类型自动被覆盖", () => {
  // account_type 是裸 text 列，没有 CHECK：封闭枚举遇到自建类型会静默放行，
  // 与 profit-accounts.ts 那次「6602 没列举导致费用被静默丢弃」同一种失败。
  assert.equal(isProfitAndLossAccountType("expense_marketing"), true);
  assert.equal(isProfitAndLossAccountType("income_subsidy"), true);
});

test("资产负债权益类不是损益类", () => {
  for (const type of [
    "asset_cash",
    "asset_receivable",
    "asset_inventory",
    "asset_fixed",
    "contra_asset",
    "liability_payable",
    "liability_tax",
    "equity",
    "equity_unaffected",
    "equity_retained"
  ]) {
    assert.equal(isProfitAndLossAccountType(type), false, `${type} 不该判为损益类`);
  }
});

test("cost_production（4001 生产成本 / 4101 制造费用）不是损益类", () => {
  // 期末余额即在产品，属存货 → 资产。reports/balance-sheet-accounts.ts 已按此归类，
  // closing.ts 的 classifyProfitAccount 也把它们排除在结转损益之外。
  // 判成损益类会让制造业客户录不进在产品期初余额，且年结会把在产品当利润转进 3141。
  assert.equal(isProfitAndLossAccountType("cost_production"), false);
  assert.equal(rejectOpeningBalance("cost_production"), null);
});

test("损益类与本年利润被拒绝录入期初余额，且拒绝原因可区分", () => {
  assert.equal(rejectOpeningBalance("income"), "PROFIT_AND_LOSS");
  assert.equal(rejectOpeningBalance("expense_direct_cost"), "PROFIT_AND_LOSS");
  // 3131 本年利润：余额由月末结转在本年度内累积、年末转平到 3141。
  // 给它期初余额等于凭空往本年度塞一笔利润。
  assert.equal(rejectOpeningBalance(CURRENT_YEAR_PROFIT_TYPE), "CURRENT_YEAR_PROFIT");
});

test("资产负债权益（含 3141 利润分配）允许期初余额", () => {
  // 3141 正是历史累积未分配利润的落脚点 —— 它必须能录。
  assert.equal(rejectOpeningBalance("equity_retained"), null);
  assert.equal(rejectOpeningBalance("asset_cash"), null);
  assert.equal(rejectOpeningBalance("liability_payable"), null);
  assert.equal(rejectOpeningBalance("equity"), null);
});

test("拒绝提示把用户引向 3141，而不是只说「不行」", () => {
  for (const reason of ["PROFIT_AND_LOSS", "CURRENT_YEAR_PROFIT"] as const) {
    const message = describeOpeningBalanceRejection(reason, ["6001"]);
    assert.ok(message.includes("6001"), "应指出具体是哪个科目");
    assert.ok(
      message.includes(RETAINED_EARNINGS_CODE),
      "应告诉用户历史未分配利润该录在 3141"
    );
  }
});
