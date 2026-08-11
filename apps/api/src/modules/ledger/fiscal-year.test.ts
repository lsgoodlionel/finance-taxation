/**
 * 会计年度的纯函数（V12-B5）。
 *
 * 日期换算刻意不经 `Date`：经 `Date` 往返会在非 UTC 运行时把 `2026-01-01` 前移
 * 一天（db/date-column.ts 为同一个原因给 pg 注册了 date 解析器）。财年边界差一天
 * 意味着 12 月 31 日的分录落到下一年，年结金额直接错。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  fiscalYearClosingPeriod,
  fiscalYearOf,
  fiscalYearProfitFilterSql,
  fiscalYearRange,
  isValidFiscalYear
} from "./fiscal-year.js";
import { ANNUAL_CLOSING_SOURCE, EXCLUDE_SYSTEM_CLOSING_SQL } from "./closing-sources.js";
import { PERIOD_CLOSING_SOURCE } from "./closing-entries.js";

test("中国财年恒等于自然年", () => {
  assert.deepEqual(fiscalYearRange(2026), { startDate: "2026-01-01", endDate: "2026-12-31" });
  // 闰年不影响年末日
  assert.deepEqual(fiscalYearRange(2028), { startDate: "2028-01-01", endDate: "2028-12-31" });
});

test("财年边界不因时区偏移一天", () => {
  const originalTz = process.env.TZ;
  try {
    // UTC+8：经 Date 往返的实现会在这里把 2026-01-01 变成 2025-12-31。
    process.env.TZ = "Asia/Shanghai";
    assert.equal(fiscalYearRange(2026).startDate, "2026-01-01");
    process.env.TZ = "Pacific/Honolulu";
    assert.equal(fiscalYearRange(2026).endDate, "2026-12-31");
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test("会计日期归属到对应财年", () => {
  assert.equal(fiscalYearOf("2026-01-01"), 2026);
  assert.equal(fiscalYearOf("2026-12-31"), 2026);
  assert.equal(fiscalYearOf("2027-01-01"), 2027);
});

test("年结凭证记在 12 月", () => {
  assert.equal(fiscalYearClosingPeriod(2026), "2026-12");
});

test("年份范围校验挡住明显错误的入参", () => {
  assert.equal(isValidFiscalYear(2026), true);
  assert.equal(isValidFiscalYear(1900), false);
  assert.equal(isValidFiscalYear(2026.5), false);
  assert.equal(isValidFiscalYear(Number.NaN), false);
});

test("Odoo 取数谓词同时限定财年区间并排除两种结转分录", () => {
  const sql = fiscalYearProfitFilterSql("$2", "$3");
  assert.ok(sql.includes("entry_date >= $2::date"));
  assert.ok(sql.includes("entry_date <= $3::date"));
  // 忘了做年结时报表仍然要对，靠的就是「只取本财年」+「排除结转」这两条一起。
  assert.ok(sql.includes(EXCLUDE_SYSTEM_CLOSING_SQL));
  for (const source of [PERIOD_CLOSING_SOURCE, ANNUAL_CLOSING_SOURCE]) {
    assert.ok(
      sql.includes(`source is distinct from '${source}'`),
      `应排除 ${source}，且必须用 is distinct from —— source 为 NULL 的历史分录用 <> 会被整批滤掉`
    );
  }
});

test("带表别名时每个列引用都被限定", () => {
  // accounts 表也有 source 列（system/custom）。与 ledger_entries 一起 JOIN 时
  // 漏掉别名会得到 "column reference source is ambiguous"，查询直接报错。
  const sql = fiscalYearProfitFilterSql("$2", "$3", "le");
  assert.ok(sql.includes("le.entry_date >= $2::date"));
  assert.ok(sql.includes("le.entry_date <= $3::date"));
  assert.ok(sql.includes("le.source is distinct from"));
  assert.ok(!/(?<!le\.)\bsource\b/.test(sql), `仍有未限定的 source 引用：${sql}`);
  assert.ok(!/(?<!le\.)\bentry_date\b/.test(sql), `仍有未限定的 entry_date 引用：${sql}`);
});
