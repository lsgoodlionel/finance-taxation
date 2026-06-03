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
