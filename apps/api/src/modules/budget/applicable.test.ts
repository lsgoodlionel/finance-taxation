/**
 * 预算适用性筛选的测试（V13-A2）。
 *
 * 这里锁的核心是**「全部适用」而非「挑一条」**——预算与费用标准在这一点上
 * 语义相反，写错会静默丢掉控制力（部门预算没超就放行，公司总预算超了没人管）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { filterApplicableBudgets, isBudgetApplicable, type BudgetDimension } from "./applicable.js";

const DEPT_TRAVEL: BudgetDimension = {
  periodType: "month",
  periodKey: "2026-06",
  costCenterId: "cc-rnd",
  accountCode: "660203" // 管理费用-差旅费
};

const DEPT_TOTAL: BudgetDimension = {
  periodType: "month",
  periodKey: "2026-06",
  costCenterId: "cc-rnd",
  accountCode: null
};

const COMPANY_TRAVEL: BudgetDimension = {
  periodType: "year",
  periodKey: "2026",
  costCenterId: null,
  accountCode: "6602"
};

const RND_TRAVEL_EXPENSE = {
  date: "2026-06-15",
  accountCode: "660203",
  costCenterId: "cc-rnd"
};

test("一笔支出同时落入多条预算时全部返回", () => {
  // Arrange：研发部差旅预算 + 研发部总预算 + 公司管理费用年度预算
  const all = [DEPT_TRAVEL, DEPT_TOTAL, COMPANY_TRAVEL];

  // Act
  const matched = filterApplicableBudgets(all, RND_TRAVEL_EXPENSE);

  // Assert：三条都管得着这笔钱，一条都不能少
  assert.equal(matched.length, 3);
});

test("科目按前缀匹配，覆盖下级明细", () => {
  // 公司预算立在 6602（管理费用）上，660203（差旅费）是它的明细，应当命中。
  assert.equal(isBudgetApplicable(COMPANY_TRAVEL, RND_TRAVEL_EXPENSE), true);
});

test("科目前缀不命中的预算不适用", () => {
  const salesBudget: BudgetDimension = { ...COMPANY_TRAVEL, accountCode: "6601" };

  assert.equal(isBudgetApplicable(salesBudget, RND_TRAVEL_EXPENSE), false);
});

test("别的部门的预算管不着这笔支出", () => {
  const otherDept: BudgetDimension = { ...DEPT_TRAVEL, costCenterId: "cc-sales" };

  assert.equal(isBudgetApplicable(otherDept, RND_TRAVEL_EXPENSE), false);
});

test("未指定成本中心的支出不落入任何部门预算", () => {
  // 与 V12-D1 部门费用报表把它们单列为「未指定」的处理一致：照实反映，
  // 不按比例摊派、不替用户猜归属。
  const noCostCenter = { ...RND_TRAVEL_EXPENSE, costCenterId: null };

  assert.equal(isBudgetApplicable(DEPT_TRAVEL, noCostCenter), false);
  assert.equal(isBudgetApplicable(DEPT_TOTAL, noCostCenter), false);
});

test("未指定成本中心的支出仍落入全公司预算", () => {
  // 全公司预算本就不分部门，漏掉这些支出会让公司总预算显示得比实际宽松。
  const noCostCenter = { ...RND_TRAVEL_EXPENSE, costCenterId: null };

  assert.equal(isBudgetApplicable(COMPANY_TRAVEL, noCostCenter), true);
});

test("不限科目的部门预算管住该部门所有支出", () => {
  const officeExpense = { ...RND_TRAVEL_EXPENSE, accountCode: "660201" };

  assert.equal(isBudgetApplicable(DEPT_TOTAL, officeExpense), true);
});

test("期间不含发生日的预算不适用", () => {
  const julyExpense = { ...RND_TRAVEL_EXPENSE, date: "2026-07-01" };

  assert.equal(isBudgetApplicable(DEPT_TRAVEL, julyExpense), false);
  // 年度预算仍然覆盖 7 月。
  assert.equal(isBudgetApplicable(COMPANY_TRAVEL, julyExpense), true);
});

test("月度预算的末日仍在期间内", () => {
  // 期间边界是闭区间。6 月 30 日的单据必须算进 6 月预算——差一天会让
  // 月末的单据神秘地不受预算控制。
  const lastDay = { ...RND_TRAVEL_EXPENSE, date: "2026-06-30" };

  assert.equal(isBudgetApplicable(DEPT_TRAVEL, lastDay), true);
});

test("没有任何预算时返回空数组，不抛错", () => {
  // 没立预算是合法状态，调用方据此放行。
  assert.deepEqual(filterApplicableBudgets([], RND_TRAVEL_EXPENSE), []);
});

test("不修改入参数组", () => {
  const all = [DEPT_TRAVEL, COMPANY_TRAVEL];
  const snapshot = [...all];
  filterApplicableBudgets(all, RND_TRAVEL_EXPENSE);

  assert.deepEqual(all, snapshot);
});
