/**
 * 费用超标判定的测试（V13-A1）。
 *
 * 匹配（match.ts）挑出适用的标准，这里把标准与实际金额比出结论。
 * 分开的理由：匹配规则与超标规则各自会变，混在一起改一个必须重读另一个。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { checkExpenseStandard } from "./check.js";
import type { ExpenseStandard } from "./match.js";

/** 住宿 300 元/晚，超了给提示。 */
const PER_DAY: ExpenseStandard = {
  id: "std-hotel",
  expenseType: "travel_hotel",
  gradeCode: null,
  cityTier: null,
  limitCents: 30000,
  limitBasis: "per_day",
  overPolicy: "warn",
  effectiveFrom: "2026-01-01",
  effectiveTo: null
};

test("按日限额乘以天数得到总限额", () => {
  // Arrange：300/晚 × 3 晚 = 900，实报 850
  // Act
  const result = checkExpenseStandard({ standard: PER_DAY, actualCents: 85000, quantity: 3 });

  // Assert
  assert.equal(result.level, "ok");
  assert.equal(result.limitCents, 90000);
  assert.equal(result.overrunCents, 0);
});

test("超标时按策略给级别，超标金额与策略无关", () => {
  const over = { standard: PER_DAY, actualCents: 100000, quantity: 3 };
  const warned = checkExpenseStandard(over);
  const blocked = checkExpenseStandard({ ...over, standard: { ...PER_DAY, overPolicy: "block" } });
  const escalated = checkExpenseStandard({ ...over, standard: { ...PER_DAY, overPolicy: "escalate" } });

  assert.equal(warned.level, "warn");
  assert.equal(blocked.level, "block");
  assert.equal(escalated.level, "escalate");
  // 同一笔业务事实，超标 100 元，不因策略而变。
  for (const r of [warned, blocked, escalated]) assert.equal(r.overrunCents, 10000);
});

test("恰好达到限额不算超标", () => {
  const result = checkExpenseStandard({ standard: PER_DAY, actualCents: 90000, quantity: 3 });

  assert.equal(result.level, "ok");
  assert.equal(result.overrunCents, 0);
});

test("按次限额忽略数量", () => {
  // per_time 的语义是「每次报销不超过 X」，乘以次数就变成了「可以多报几次」，
  // 那是对限额的曲解。
  const perTime: ExpenseStandard = { ...PER_DAY, limitBasis: "per_time", limitCents: 50000 };
  const result = checkExpenseStandard({ standard: perTime, actualCents: 60000, quantity: 5 });

  assert.equal(result.limitCents, 50000);
  assert.equal(result.overrunCents, 10000);
});

test("按月限额同样忽略数量", () => {
  const perMonth: ExpenseStandard = { ...PER_DAY, limitBasis: "per_month", limitCents: 200000 };
  const result = checkExpenseStandard({ standard: perMonth, actualCents: 150000, quantity: 12 });

  assert.equal(result.limitCents, 200000);
  assert.equal(result.level, "ok");
});

test("没有适用标准时放行，并说明原因", () => {
  // 没配标准是合法状态。这里必须放行而不是拦截——拦截会让「还没来得及配标准」
  // 的公司完全无法提单。
  const result = checkExpenseStandard({ standard: null, actualCents: 999999, quantity: 1 });

  assert.equal(result.level, "ok");
  assert.equal(result.limitCents, null);
  assert.equal(result.code, "standard.none");
  assert.match(result.message, /未配置/);
});

test("按日限额的天数必须为正整数", () => {
  // 0 天会让总限额变成 0，于是任何金额都「超标」——静默通过会造成大面积误报。
  assert.throws(() => checkExpenseStandard({ standard: PER_DAY, actualCents: 100, quantity: 0 }), /正整数/);
  assert.throws(() => checkExpenseStandard({ standard: PER_DAY, actualCents: 100, quantity: 1.5 }), /正整数/);
});

test("金额必须是非负整数分", () => {
  assert.throws(
    () => checkExpenseStandard({ standard: PER_DAY, actualCents: 1.5, quantity: 1 }),
    /整数分/
  );
  assert.throws(
    () => checkExpenseStandard({ standard: PER_DAY, actualCents: -1, quantity: 1 }),
    /不得为负/
  );
});

test("message 带上限额与实际金额，不只说结论", () => {
  const result = checkExpenseStandard({ standard: PER_DAY, actualCents: 100000, quantity: 3 });

  assert.match(result.message, /900\.00/); // 限额
  assert.match(result.message, /1000\.00/); // 实际
  assert.equal(result.code, "standard.overrun");
});

test("按日限额的 message 说明限额是怎么算出来的", () => {
  // 用户看到「超标 100 元」的第一反应是「限额多少」，第二反应是「怎么算的」。
  // 300×3 这个式子写出来，比让用户自己去查标准表快得多。
  const result = checkExpenseStandard({ standard: PER_DAY, actualCents: 100000, quantity: 3 });

  assert.match(result.message, /300\.00/);
  assert.match(result.message, /3/);
});
