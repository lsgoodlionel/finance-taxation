/**
 * 预算校验纯函数的测试（V13-A3）。
 *
 * 这里锁住的是**预算控制的三个数如何相互作用**：预算额、已占用、已实际发生。
 * 只记实际发生数是最常见的错法——三个人各自申请 8 万、预算 10 万，逐张看都没超，
 * 全部通过后实际超支 14 万。占用（encumbrance）就是为了堵这个洞。
 *
 * 金额一律整数分，与折旧、外币分摊同一口径。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { checkBudget } from "./check.js";

/** 预算 10 万，干净的起点。 */
const BASE = { budgetCents: 10_0000, encumberedCents: 0, actualCents: 0, policy: "block" as const };

test("未超支：可用额度是预算减去已占用与已发生", () => {
  // Arrange：预算 10 万，已占用 3 万，已发生 2 万
  const input = { ...BASE, encumberedCents: 3_0000, actualCents: 2_0000, requestCents: 1_0000 };

  // Act
  const result = checkBudget(input);

  // Assert
  assert.equal(result.level, "ok");
  assert.equal(result.availableCents, 5_0000);
  assert.equal(result.remainingCents, 4_0000);
  assert.equal(result.overrunCents, 0);
});

test("恰好用完不算超支：可用额度归零仍放行", () => {
  // 「花完预算」是正常经营行为，不是异常。用 > 而不是 >= 判超支。
  const result = checkBudget({ ...BASE, encumberedCents: 6_0000, requestCents: 4_0000 });

  assert.equal(result.level, "ok");
  assert.equal(result.remainingCents, 0);
  assert.equal(result.overrunCents, 0);
});

test("超支 + block 策略：拦截，并报出超支金额", () => {
  const result = checkBudget({ ...BASE, encumberedCents: 6_0000, requestCents: 5_0000 });

  assert.equal(result.level, "block");
  assert.equal(result.availableCents, 4_0000);
  assert.equal(result.remainingCents, -1_0000);
  assert.equal(result.overrunCents, 1_0000);
});

test("超支 + warn 策略：放行但标记，超支金额与 block 时一致", () => {
  // 同一笔业务事实，级别取决于策略，数字不能跟着策略变。
  const overrun = { ...BASE, encumberedCents: 6_0000, requestCents: 5_0000 };
  const blocked = checkBudget({ ...overrun, policy: "block" });
  const warned = checkBudget({ ...overrun, policy: "warn" });

  assert.equal(warned.level, "warn");
  assert.equal(warned.overrunCents, blocked.overrunCents);
  assert.equal(warned.remainingCents, blocked.remainingCents);
});

test("存量已超支时，零金额申请也照实报超支", () => {
  // 差额不凑平：预算已经被占超了，即便本次申请 0 元，也要把 -2 万如实报出来，
  // 不能因为「本次没加钱」就显示为 ok。
  const result = checkBudget({ ...BASE, encumberedCents: 8_0000, actualCents: 4_0000, requestCents: 0 });

  assert.equal(result.level, "block");
  assert.equal(result.availableCents, -2_0000);
  assert.equal(result.remainingCents, -2_0000);
  assert.equal(result.overrunCents, 2_0000);
});

test("预算为 0：任何正数申请都是超支", () => {
  const result = checkBudget({ ...BASE, budgetCents: 0, requestCents: 100 });

  assert.equal(result.level, "block");
  assert.equal(result.overrunCents, 100);
});

test("占用与实际发生不重复计：同一笔转实际后占用应由调用方扣减", () => {
  // 纯函数不知道单据流转，它只对传入的三个数负责。这条用例锁的是**口径**：
  // 已占用 3 万 + 已发生 2 万 = 已用 5 万，而不是把转实际的那笔算两遍变成 8 万。
  // 调用方（占用台账）负责在 reserved → realized 时把金额移出 encumberedCents。
  const result = checkBudget({ ...BASE, encumberedCents: 3_0000, actualCents: 2_0000, requestCents: 0 });

  assert.equal(result.availableCents, 5_0000);
});

test("非整数与非有限输入一律拒绝，不做静默取整", () => {
  // 静默 Math.round 会让「预算 100.005 元」这类脏数据无声地变成另一个数字，
  // 而金额差一分在对账时要查很久。
  assert.throws(() => checkBudget({ ...BASE, requestCents: 1.5 }), /整数分/);
  assert.throws(() => checkBudget({ ...BASE, requestCents: Number.NaN }), /整数分/);
  // 无穷大能通过 `typeof === 'number'` 和大于零的判断，只有 Number.isInteger 拦得住。
  assert.throws(
    () => checkBudget({ ...BASE, budgetCents: Number.POSITIVE_INFINITY, requestCents: 0 }),
    /整数分/
  );
});

test("负数预算或负数申请一律拒绝", () => {
  // 已占用/已发生允许为 0 但不允许为负；预算额同理。红冲导致的负数应由调用方
  // 在汇总时处理成 0，而不是把负数喂进校验。
  assert.throws(() => checkBudget({ ...BASE, budgetCents: -1, requestCents: 0 }), /不得为负/);
  assert.throws(() => checkBudget({ ...BASE, requestCents: -1 }), /不得为负/);
  assert.throws(() => checkBudget({ ...BASE, encumberedCents: -1, requestCents: 0 }), /不得为负/);
});

test("message 带上三个数的构成，便于直接展示给用户", () => {
  // 只说「超支 1 万」，用户下一句必然是「为什么」。把构成写进消息里，
  // 省掉一次来回。
  const result = checkBudget({ ...BASE, encumberedCents: 6_0000, actualCents: 1_0000, requestCents: 5_0000 });

  assert.match(result.message, /1000\.00/); // 预算 10 万分 = 1000 元
  assert.match(result.message, /超支/);
  assert.equal(result.code, "budget.overrun");
});

test("未超支时 code 为 budget.ok", () => {
  const result = checkBudget({ ...BASE, requestCents: 1 });

  assert.equal(result.code, "budget.ok");
});
