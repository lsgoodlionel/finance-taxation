/**
 * 校验结果收敛的测试（V13）。
 *
 * 审批流引擎用 `highestLevel` 把一组校验收敛成一个动作。这里锁的是
 * **级别的严厉次序**——尤其是 `escalate` 排在 `warn` 之后、`block` 之前。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { highestLevel, isBlocking, type ControlCheckResult } from "./result.js";

const at = (level: ControlCheckResult["level"]): ControlCheckResult => ({
  level,
  code: `test.${level}`,
  message: level
});

test("空数组视为通过", () => {
  // 没有配置任何校验规则是合法状态，不能因此拦截。
  assert.equal(highestLevel([]), "ok");
});

test("取最严厉的级别", () => {
  assert.equal(highestLevel([at("ok"), at("warn"), at("ok")]), "warn");
  assert.equal(highestLevel([at("warn"), at("block"), at("escalate")]), "block");
});

test("escalate 比 warn 严厉、比 block 宽松", () => {
  // 这个次序是关键：超标要加签（escalate）时，不能被同时存在的 warn 盖过去，
  // 也不能升级成 block 把单子直接拦死。
  assert.equal(highestLevel([at("warn"), at("escalate")]), "escalate");
  assert.equal(highestLevel([at("escalate"), at("block")]), "block");
});

test("顺序不影响结果", () => {
  const mixed = [at("escalate"), at("ok"), at("warn")];
  assert.equal(highestLevel(mixed), highestLevel([...mixed].reverse()));
});

test("只有 block 阻断提交，escalate 不阻断", () => {
  // escalate 是「可以报，但要多一个人点头」，不是拦截。混淆两者会让
  // 超标费用在业务上变成不可报销。
  assert.equal(isBlocking(at("block")), true);
  assert.equal(isBlocking(at("escalate")), false);
  assert.equal(isBlocking(at("warn")), false);
  assert.equal(isBlocking(at("ok")), false);
});
