import assert from "node:assert/strict";
import test from "node:test";
import {
  FLAT_TREND,
  NO_PRIOR_PERIOD_TREND,
  formatAmount,
  formatBalanceTrend,
  previousPeriodEndDate
} from "./kpi.js";

test("previousPeriodEndDate returns the last day of the preceding month", () => {
  assert.equal(previousPeriodEndDate("2026-05"), "2026-04-30");
  assert.equal(previousPeriodEndDate("2026-03"), "2026-02-28");
  assert.equal(previousPeriodEndDate("2024-03"), "2024-02-29");
  assert.equal(previousPeriodEndDate("2026-08"), "2026-07-31");
});

test("previousPeriodEndDate rolls back across the year boundary", () => {
  assert.equal(previousPeriodEndDate("2026-01"), "2025-12-31");
});

test("formatBalanceTrend reports the real month-over-month delta, not the value itself", () => {
  // 旧的假环比会输出 `+2,000`（卡片自身的余额）；真环比是 2000 − 700。
  assert.equal(formatBalanceTrend(2000, 700), "+1,300");
});

test("formatBalanceTrend marks a decrease with a minus sign", () => {
  assert.equal(formatBalanceTrend(700, 2000), "-1,300");
});

test("formatBalanceTrend treats a zero prior balance as a real baseline, not missing data", () => {
  // 上期有账但该科目余额为 0：环比就是本期全额，不需要降级文案，也不会除零。
  assert.equal(formatBalanceTrend(1300, 0), "+1,300");
  assert.equal(formatBalanceTrend(-500, 0), "-500");
});

test("formatBalanceTrend degrades explicitly when there is no prior period at all", () => {
  assert.equal(formatBalanceTrend(1300, null), NO_PRIOR_PERIOD_TREND);
  assert.equal(formatBalanceTrend(0, null), NO_PRIOR_PERIOD_TREND);
});

test("formatBalanceTrend reports 持平 for an unchanged balance", () => {
  assert.equal(formatBalanceTrend(1300, 1300), FLAT_TREND);
  assert.equal(formatBalanceTrend(0, 0), FLAT_TREND);
  // 展示精度是「元」，不足 0.5 元的变化四舍五入后是 0，不能渲染成「-0」的红色下跌。
  assert.equal(formatBalanceTrend(1300, 1300.4), FLAT_TREND);
  assert.equal(formatBalanceTrend(1300.4, 1300), FLAT_TREND);
});

test("formatBalanceTrend keeps direction correct when both periods are negative", () => {
  // 2221 借方余额（留抵）走弱：−200 → −500 是继续变负，必须显示为下跌。
  assert.equal(formatBalanceTrend(-500, -200), "-300");
  // 反向：−500 → −200 是回升。
  assert.equal(formatBalanceTrend(-200, -500), "+300");
});

test("formatAmount normalises negative zero and keeps the sign otherwise", () => {
  assert.equal(formatAmount(-0), "0");
  assert.equal(formatAmount(-500), "-500");
  assert.equal(formatAmount(1535000), "1,535,000");
});
