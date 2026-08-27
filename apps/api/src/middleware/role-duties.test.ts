/**
 * 角色权限与岗位职责的对齐（V16 角色实验）。
 *
 * ## 为什么单独写这一组
 *
 * 六个角色的操作实验里，有四件**本职工作**被权限挡死：
 *
 * | 角色 | 做不了的事 | 缺的权限 |
 * |------|-----------|---------|
 * | 出纳 | 看不到任何应付信息，付款中心整个不在菜单里 | `contracts.view` |
 * | 税务专员 | 研发费用加计扣除归集 | `rnd.view` |
 * | 税务专员 | 税务风险提示 | `risk.view` |
 * | 会计 | 跑不了事项分析（唯一做账的人却生成不了凭证草稿） | analyze 挂错权限 |
 *
 * 更糟的是它们的表现形式：不是报错，而是**页面显示「还没有研发项目」
 * 「0 条风险 · 全部已关闭」**——看起来一切正常。
 *
 * ## 这组测试断言的是「职责边界」，不是「权限表长什么样」
 *
 * 每一条都对应一句业务判断，注释里写清理由。
 * 补权限很容易越补越宽，所以**反向断言同样重要**：
 * 出纳不该有记账权、税务专员不该能关闭风险。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission } from "./auth.js";

const ACCOUNTANT = ["role-accountant"];
const CASHIER = ["role-cashier"];
const TAX = ["role-tax-specialist"];
const EMPLOYEE = ["role-employee"];

test("出纳能看合同——付款按合同期次付，看不到合同就看不到应付", () => {
  // 「本月应付」列表、付款单列表、左侧付款中心菜单**全部挂在 contracts.view 上**。
  // 缺了它，出纳登进来一片空白，深链进去整页 403。
  assert.equal(hasPermission(CASHIER, "contracts.view"), true);

  // 但只读：合同条款的维护不是出纳的事。
  assert.equal(hasPermission(CASHIER, "contracts.manage"), false);
});

test("出纳仍然没有记账权——管钱与管账必须分开", () => {
  // 这是内控底线，补别的权限时不能顺手把它放开。
  assert.equal(hasPermission(CASHIER, "ledger.post"), false);
  assert.equal(hasPermission(CASHIER, "ledger.view"), true, "看账是本职，记账不是");
});

test("税务专员能看研发项目与税务风险——两件都是本职", () => {
  // 研发费用加计扣除要归集研发项目的费用；
  // 风险引擎里的规则本身就是税务规则（「收入已入账但未形成增值税事项」这类）。
  assert.equal(hasPermission(TAX, "rnd.view"), true);
  assert.equal(hasPermission(TAX, "risk.view"), true);
});

test("税务专员只有读权限——立项与关闭风险不是他的决定", () => {
  assert.equal(hasPermission(TAX, "rnd.manage"), false);
  assert.equal(hasPermission(TAX, "risk.manage"), false);
});

test("会计有记账权，但没有建事项权——做账的人不该自己造业务", () => {
  assert.equal(hasPermission(ACCOUNTANT, "ledger.post"), true);
  assert.equal(
    hasPermission(ACCOUNTANT, "events.create"),
    false,
    "事项由业务人员发起。会计要能跑分析，靠的是记账权而不是建单权——" +
      "见 routes/groups/events-tasks.ts 里 analyze 的 anyOf"
  );
});

test("员工能建事项，但碰不到账", () => {
  assert.equal(hasPermission(EMPLOYEE, "events.create"), true);
  assert.equal(hasPermission(EMPLOYEE, "ledger.post"), false);
  assert.equal(hasPermission(EMPLOYEE, "expense.manage"), false, "员工不能审批费用");
  assert.equal(hasPermission(EMPLOYEE, "expense.submit"), true, "但能提自己的单");
});
