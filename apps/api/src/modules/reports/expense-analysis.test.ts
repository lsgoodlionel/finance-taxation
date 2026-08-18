/**
 * 费用分析辅助函数的测试（V13-D6）。
 *
 * 聚合本身要连库（放在集成测试里）。这里锁住月份进位——跨年是最容易漏的
 * 一处，而漏了会让 12 月的报表查不到任何数据。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { nextMonthFirstDay } from "./expense-analysis.js";

test("普通月份进位", () => {
  assert.equal(nextMonthFirstDay("2026-06"), "2026-07-01");
});

test("跨年进位", () => {
  // 12 月不进位的话，`< 2026-13-01` 是个非法日期，SQL 直接报错或返回空——
  // 表现为「12 月的报表永远没数据」。
  assert.equal(nextMonthFirstDay("2026-12"), "2027-01-01");
});

test("一月不受影响", () => {
  assert.equal(nextMonthFirstDay("2026-01"), "2026-02-01");
});

test("十一月到十二月不进位", () => {
  assert.equal(nextMonthFirstDay("2026-11"), "2026-12-01");
});

test("月份补零", () => {
  // 「2026-9-01」在 date 比较里是合法的，但与其他地方的 YYYY-MM-DD
  // 格式不一致，字符串比较时会出错。
  assert.equal(nextMonthFirstDay("2026-08"), "2026-09-01");
});
