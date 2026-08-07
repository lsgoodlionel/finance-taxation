/**
 * 期初余额的借贷平衡校验（V12-B4）。
 *
 * 这里钉死的核心决定是：**不平就拒绝，系统不把差额自动塞进 3141**。
 * 自动补平会把「漏录了一笔 80 万应收账款」和「以前年度累积的未分配利润」混为
 * 一谈 —— 前者被补平之后账面是平的但应收账款少了 80 万，这不是校验，是掩盖。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { checkOpeningBalanceEquation } from "./opening-balance.js";
import { RETAINED_EARNINGS_CODE } from "./account-semantics.js";

test("借贷相等时通过", () => {
  const result = checkOpeningBalanceEquation([
    { accountCode: "1002", debit: "800000.00", credit: "0" },
    { accountCode: "1122", debit: "200000.00", credit: "0" },
    { accountCode: "3001", debit: "0", credit: "700000.00" },
    { accountCode: RETAINED_EARNINGS_CODE, debit: "0", credit: "300000.00" }
  ]);
  assert.equal(result, null);
});

test("不平时返回差额而不是只说「不平」", () => {
  // 少录了 300000 的未分配利润 —— 用户需要知道差多少才能判断是漏录还是利润分配。
  const result = checkOpeningBalanceEquation([
    { accountCode: "1002", debit: "800000.00", credit: "0" },
    { accountCode: "1122", debit: "200000.00", credit: "0" },
    { accountCode: "3001", debit: "0", credit: "700000.00" }
  ]);
  assert.ok(result, "应判为不平");
  assert.equal(result.code, "OPENING_BALANCE_NOT_BALANCED");
  assert.equal(result.totalDebit, "1000000.00");
  assert.equal(result.totalCredit, "700000.00");
  assert.equal(result.difference, "300000.00");
});

test("提示里明确说明系统不会自动补平，并指向 3141", () => {
  const result = checkOpeningBalanceEquation([{ accountCode: "1002", debit: "1", credit: "0" }]);
  assert.ok(result);
  assert.ok(
    result.message.includes("不会自动补平"),
    "必须让用户知道差额不会被系统悄悄抹平"
  );
  assert.ok(result.message.includes(RETAINED_EARNINGS_CODE));
});

test("借方少时差额为负，方向提示相应反转", () => {
  const result = checkOpeningBalanceEquation([
    { accountCode: "3001", debit: "0", credit: "500.00" }
  ]);
  assert.ok(result);
  assert.equal(result.difference, "-500.00");
  assert.ok(result.message.includes("借方少"));
});

test("数值与字符串金额混用、缺省字段都按 0 处理", () => {
  assert.equal(
    checkOpeningBalanceEquation([
      { accountCode: "1002", debit: 1500 },
      { accountCode: "3001", credit: "1500" }
    ]),
    null
  );
});

test("半分钱以内的浮点误差不判为不平", () => {
  // 金额列是 numeric(18,2)，容差存在只是为了吸收 JS 浮点求和的尾差，
  // 不是为了放过真实差额 —— 1 分钱必须报出来。
  assert.equal(
    checkOpeningBalanceEquation([
      { accountCode: "1002", debit: "0.10" },
      { accountCode: "1122", debit: "0.20" },
      { accountCode: "3001", credit: "0.30" }
    ]),
    null
  );
  assert.ok(
    checkOpeningBalanceEquation([
      { accountCode: "1002", debit: "0.31" },
      { accountCode: "3001", credit: "0.30" }
    ]),
    "1 分钱的差额必须报出来"
  );
});
