/**
 * 结转口径常量与谓词（V12-B5）。
 *
 * 这套东西看着像样板，但它决定「哪些分录算重复计量」。closing-entries.ts 的头注
 * 记录过一次教训：读路径漏排除结转分录，已结转期间的收入/成本/费用/净利会全部
 * 塌成 0，且是静默的。年结引入了第二种系统分录，同类风险随之翻倍。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ANNUAL_CLOSING_SOURCE,
  EXCLUDE_SYSTEM_CLOSING_SQL,
  excludeSystemClosingSql,
  isOpeningBalanceEntry,
  isSystemClosingEntry,
  OPENING_BALANCE_SOURCE,
  SYSTEM_CLOSING_SOURCES
} from "./closing-sources.js";
import { PERIOD_CLOSING_SOURCE } from "./closing-entries.js";

test("系统结转口径覆盖月末与年末，且不含期初", () => {
  assert.deepEqual([...SYSTEM_CLOSING_SOURCES], [PERIOD_CLOSING_SOURCE, ANNUAL_CLOSING_SOURCE]);
  // 期初余额是真实余额，不是结转 —— 把它一起排除会让所有报表丢掉建账时的家底。
  assert.ok(!SYSTEM_CLOSING_SOURCES.includes(OPENING_BALANCE_SOURCE as never));
});

test("排除谓词一律用 is distinct from", () => {
  // source 为 NULL 的历史分录用 `<>` 求值为 NULL（即假），会把全部历史业务分录
  // 一并滤掉 —— 比原缺陷更糟的静默失真。
  assert.ok(!EXCLUDE_SYSTEM_CLOSING_SQL.includes("<>"));
  assert.equal(
    EXCLUDE_SYSTEM_CLOSING_SQL,
    `source is distinct from '${PERIOD_CLOSING_SOURCE}' and source is distinct from '${ANNUAL_CLOSING_SOURCE}'`
  );
});

test("别名形式限定每一处 source 引用", () => {
  // accounts 表也有 source 列（system/custom）；JOIN 时不限定会 ambiguous。
  assert.equal(
    excludeSystemClosingSql("le"),
    `le.source is distinct from '${PERIOD_CLOSING_SOURCE}' and le.source is distinct from '${ANNUAL_CLOSING_SOURCE}'`
  );
});

test("内存过滤与 SQL 谓词语义一致", () => {
  assert.equal(isSystemClosingEntry({ source: PERIOD_CLOSING_SOURCE }), true);
  assert.equal(isSystemClosingEntry({ source: ANNUAL_CLOSING_SOURCE }), true);
  assert.equal(isSystemClosingEntry({ source: "voucher_posting" }), false);
  assert.equal(isSystemClosingEntry({ source: OPENING_BALANCE_SOURCE }), false);
  // source 缺失/为 NULL 的历史分录是业务分录，不能被当成结转滤掉
  assert.equal(isSystemClosingEntry({ source: null }), false);
  assert.equal(isSystemClosingEntry({}), false);

  assert.equal(isOpeningBalanceEntry({ source: OPENING_BALANCE_SOURCE }), true);
  assert.equal(isOpeningBalanceEntry({ source: "voucher_posting" }), false);
});
