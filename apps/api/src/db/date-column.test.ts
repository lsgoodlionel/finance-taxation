import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { PG_DATE_OID, parsePgDate, registerPgDateParsers, toDateOnly } from "./date-column.js";

/**
 * 时区回归护栏。问题背景：PG `date` 经 node-postgres 默认解析会变成「本地时区的
 * 午夜 Date」，再 `.toISOString().slice(0, 10)` 就把 2026-07-01 前移成 2026-06-30
 * （UTC+8 下），使每月 1 号的分录被算进上一期。
 *
 * 这里用两种互补方式证明修复：
 * 1) 纯函数断言：toDateOnly / parsePgDate 的输出与进程时区无关；
 * 2) 显式在 Asia/Shanghai 时区下重跑同一组断言（见 withTimeZone）。
 *
 * 之所以用 `process.env.TZ` + `Date` 重置而不是起子进程：Node 在 `process.env.TZ`
 * 被赋值后会对随后新建的 Date 生效，足以覆盖本文件里的纯函数路径，且不引入
 * 额外的测试基建。
 */
const TIME_ZONES = ["UTC", "Asia/Shanghai", "America/Los_Angeles"] as const;

function withTimeZone(timeZone: string, fn: () => void): void {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
}

test("parsePgDate returns the raw YYYY-MM-DD text untouched in every time zone", () => {
  for (const timeZone of TIME_ZONES) {
    withTimeZone(timeZone, () => {
      assert.equal(parsePgDate("2026-07-01"), "2026-07-01", `TZ=${timeZone}`);
      assert.equal(parsePgDate("2026-01-01"), "2026-01-01", `TZ=${timeZone}`);
      assert.equal(parsePgDate("2025-12-31"), "2025-12-31", `TZ=${timeZone}`);
      assert.equal(parsePgDate(null), null, `TZ=${timeZone}`);
    });
  }
});

test("toDateOnly keeps the calendar date stable across time zones for string input", () => {
  const results = TIME_ZONES.map((timeZone) => {
    let mapped = "";
    withTimeZone(timeZone, () => {
      mapped = toDateOnly("2026-07-01") ?? "";
    });
    return mapped;
  });

  assert.deepEqual(results, ["2026-07-01", "2026-07-01", "2026-07-01"]);
});

test("toDateOnly recovers the calendar date from node-postgres' local-midnight Date", () => {
  // node-postgres 的默认 `date` 解析器构造的正是「本地时区午夜」的 Date。
  // 用本地 getter 还原可以拿回原始日历日期；若改用 UTC getter，UTC+8 下会前移一天。
  for (const timeZone of TIME_ZONES) {
    withTimeZone(timeZone, () => {
      const localMidnight = new Date(2026, 6, 1, 0, 0, 0, 0);
      assert.equal(toDateOnly(localMidnight), "2026-07-01", `TZ=${timeZone}`);
    });
  }
});

test("the old ISO-roundtrip mapping is the one that shifts the day (regression guard)", () => {
  // 复刻旧写法在 UTC+8 下的失效路径：`date` 被解析成 +08:00 午夜后再取 ISO 日期，
  // 2026-07-01 变成 2026-06-30——每月 1 号被算进上一期。断言本身与进程时区无关。
  const shanghaiMidnight = new Date("2026-07-01T00:00:00+08:00");
  assert.equal(shanghaiMidnight.toISOString().slice(0, 10), "2026-06-30");

  // 新写法不再经 JS Date 往返，日期保持不变。
  assert.equal(toDateOnly("2026-07-01"), "2026-07-01");
});

test("toDateOnly handles empty and invalid values explicitly", () => {
  assert.equal(toDateOnly(null), null);
  assert.equal(toDateOnly(undefined), null);
  assert.equal(toDateOnly(""), null);
  assert.equal(toDateOnly(new Date("not-a-date")), null);
});

test("toDateOnly truncates an ISO timestamp string to its date part", () => {
  assert.equal(toDateOnly("2026-07-01T00:00:00.000Z"), "2026-07-01");
});

test("registerPgDateParsers installs a string parser for the DATE oid", () => {
  registerPgDateParsers();
  const parser = pg.types.getTypeParser(PG_DATE_OID) as (raw: string) => unknown;

  assert.equal(parser("2026-07-01"), "2026-07-01");
  assert.equal(typeof parser("2026-07-01"), "string");
});
