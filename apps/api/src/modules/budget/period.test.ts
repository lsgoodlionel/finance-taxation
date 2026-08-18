/**
 * 预算期间换算的测试（V13-A2）。
 *
 * 预算按月/季/年立，而实际发生额要按日期范围去 ledger_entries 里取。
 * 换算错一天，季度末或年末的单据就会算到下一期去——而那种错在报表上
 * 表现为「上季度预算没用完、这季度莫名超支」，极难反查。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { periodKeyToDateRange, periodKeyContains } from "./period.js";

test("月度：起止是当月首末日", () => {
  assert.deepEqual(periodKeyToDateRange("month", "2026-06"), {
    startDate: "2026-06-01",
    endDate: "2026-06-30"
  });
});

test("月度：31 天的月份与 2 月都要对", () => {
  assert.equal(periodKeyToDateRange("month", "2026-07").endDate, "2026-07-31");
  assert.equal(periodKeyToDateRange("month", "2026-02").endDate, "2026-02-28");
});

test("闰年 2 月是 29 天", () => {
  // 2028 是闰年。硬编码月末天数表会在这里出错，所以实现必须真的算。
  assert.equal(periodKeyToDateRange("month", "2028-02").endDate, "2028-02-29");
});

test("百年不闰、四百年再闰", () => {
  // 1900 不是闰年，2000 是。这是格里高利历的规则，简单的 %4 判定会错。
  assert.equal(periodKeyToDateRange("month", "1900-02").endDate, "1900-02-28");
  assert.equal(periodKeyToDateRange("month", "2000-02").endDate, "2000-02-29");
});

test("季度：四个季度的边界", () => {
  assert.deepEqual(periodKeyToDateRange("quarter", "2026-Q1"), {
    startDate: "2026-01-01",
    endDate: "2026-03-31"
  });
  assert.deepEqual(periodKeyToDateRange("quarter", "2026-Q2"), {
    startDate: "2026-04-01",
    endDate: "2026-06-30"
  });
  assert.deepEqual(periodKeyToDateRange("quarter", "2026-Q3"), {
    startDate: "2026-07-01",
    endDate: "2026-09-30"
  });
  assert.deepEqual(periodKeyToDateRange("quarter", "2026-Q4"), {
    startDate: "2026-10-01",
    endDate: "2026-12-31"
  });
});

test("年度：全年", () => {
  assert.deepEqual(periodKeyToDateRange("year", "2026"), {
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  });
});

test("格式与类型不配对时抛错，不静默兜底", () => {
  // 库里有 CHECK 约束挡着，但取数路径上仍要拒——数据可能来自接口参数
  // 而不是库里的行。静默返回一个「差不多的」范围会让超支算到错误的期间。
  assert.throws(() => periodKeyToDateRange("month", "2026"), /期间键/);
  assert.throws(() => periodKeyToDateRange("quarter", "2026-06"), /期间键/);
  assert.throws(() => periodKeyToDateRange("year", "2026-Q1"), /期间键/);
  assert.throws(() => periodKeyToDateRange("month", "2026-13"), /期间键/);
  assert.throws(() => periodKeyToDateRange("quarter", "2026-Q5"), /期间键/);
});

test("periodKeyContains：判断某天是否落在期间内", () => {
  // 申请单要找「这笔支出该占哪个期间的预算」，用发生日反查。
  assert.equal(periodKeyContains("month", "2026-06", "2026-06-01"), true);
  assert.equal(periodKeyContains("month", "2026-06", "2026-06-30"), true);
  assert.equal(periodKeyContains("month", "2026-06", "2026-07-01"), false);
  assert.equal(periodKeyContains("quarter", "2026-Q2", "2026-05-15"), true);
  assert.equal(periodKeyContains("year", "2026", "2026-12-31"), true);
  assert.equal(periodKeyContains("year", "2026", "2027-01-01"), false);
});
