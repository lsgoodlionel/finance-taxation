import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCashForecast } from "./cash-forecast.js";

test("资金充裕时可发工资且有结余", () => {
  const f = buildCashForecast({ cashBalance: 100000, receivables: 50000, payables: 20000, taxLiability: 10000, upcomingPayroll: 30000, upcomingSocialSecurity: 10000 });
  assert.equal(f.canPaySalary, true);
  assert.equal(f.gap, 0);
  // 100000 + 50000 - (20000+10000+30000+10000) = 80000
  assert.equal(f.projectedBalance, 80000);
});

test("现金不足发工资时给出警告", () => {
  const f = buildCashForecast({ cashBalance: 20000, receivables: 0, payables: 0, taxLiability: 0, upcomingPayroll: 30000, upcomingSocialSecurity: 10000 });
  assert.equal(f.canPaySalary, false);
  assert.match(f.verdict, /不足以支付/);
});

test("工资可发但结清应付后有缺口", () => {
  const f = buildCashForecast({ cashBalance: 50000, receivables: 0, payables: 60000, taxLiability: 0, upcomingPayroll: 30000, upcomingSocialSecurity: 5000 });
  assert.equal(f.canPaySalary, true); // 50000 >= 35000
  assert.ok(f.gap > 0);              // 50000 - (60000+35000) < 0
});

test("salaryNeed 为工资+社保合计", () => {
  const f = buildCashForecast({ cashBalance: 0, receivables: 0, payables: 0, taxLiability: 0, upcomingPayroll: 30000, upcomingSocialSecurity: 8000 });
  assert.equal(f.salaryNeed, 38000);
});

test("负数输入被安全归零", () => {
  const f = buildCashForecast({ cashBalance: 10000, receivables: -5, payables: -100, taxLiability: -1, upcomingPayroll: -2, upcomingSocialSecurity: -3 });
  assert.equal(f.expectedInflow, 0);
  assert.equal(f.expectedOutflow, 0);
  assert.equal(f.projectedBalance, 10000);
});

// ─── 无数据不给结论（V16 角色实验）──────────────────────────────────────────
// 董事长 agent 在驾驶舱上看到「资金充裕：本期工资社保可发」，而账上一分钱没有。
// 根因是 0 >= 0 为真。老板会信带数字的那句话。

test("全零输入返回「算不出」，而不是「资金充裕」", () => {
  const result = buildCashForecast({
    cashBalance: 0, receivables: 0, payables: 0,
    taxLiability: 0, upcomingPayroll: 0, upcomingSocialSecurity: 0
  });

  assert.equal(result.canPaySalary, null, "没有数据时必须是 null，不能是 true");
  assert.match(result.verdict, /算不出/);
  assert.doesNotMatch(result.verdict, /充裕/, "一家没录过账的公司不该被告知资金充裕");
});

test("账上有钱但没有工资需求，仍然给正常结论", () => {
  // 与上一条的区别：这家公司**有**数据，只是这个月不用发工资。
  const result = buildCashForecast({
    cashBalance: 50000, receivables: 0, payables: 0,
    taxLiability: 0, upcomingPayroll: 0, upcomingSocialSecurity: 0
  });

  assert.equal(result.canPaySalary, true);
  assert.match(result.verdict, /充裕/);
});

test("零余额但有应付：算得出，且结论是负面的", () => {
  const result = buildCashForecast({
    cashBalance: 0, receivables: 0, payables: 30000,
    taxLiability: 0, upcomingPayroll: 20000, upcomingSocialSecurity: 0
  });

  assert.equal(result.canPaySalary, false, "发不出工资是算得出来的结论，不是「没数据」");
  assert.match(result.verdict, /不足以支付/);
});
