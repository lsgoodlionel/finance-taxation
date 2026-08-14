/**
 * 税法加速折旧的两种方法（V12-D4 二期）。
 *
 * 法规依据：
 * - 《企业所得税法实施条例》第九十八条：由于技术进步、产品更新换代较快，或常年
 *   处于强震动、高腐蚀状态的固定资产，可以缩短折旧年限或采取加速折旧的方法。
 *   缩短折旧年限的，**最低折旧年限不得低于本条例第六十条规定折旧年限的 60%**；
 *   采取加速折旧方法的，可以采用**双倍余额递减法**或者**年数总和法**。
 *
 * 这两种方法的算法都是死的，写成纯函数逐年断言。金额一律用整数分。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { acceleratedScheduleCents, MIN_SHORTENED_LIFE_RATIO } from "./accelerated-depreciation.js";
// 年限下限住在 tax-depreciation.ts —— 它要 taxMinimumLifeMonths，而那边要本模块的
// 排程算法，放一起就是循环依赖。
import { minimumShortenedLifeMonths } from "./tax-depreciation.js";

/** 100 万原值、残值 10 万、5 年，两种方法都用它，便于横向对照。 */
const BASE = { originalCostCents: 100_0000_00, salvageValueCents: 10_0000_00, lifeYears: 5 };

test("年数总和法：逐年递减，分母是 n(n+1)/2", () => {
  const schedule = acceleratedScheduleCents({ ...BASE, method: "sum_of_years" });

  // 可折旧总额 90 万，年数总和 15，各年权重 5/4/3/2/1
  assert.deepEqual(schedule, [
    30_0000_00, // 90万 × 5/15
    24_0000_00, // 90万 × 4/15
    18_0000_00, // 90万 × 3/15
    12_0000_00, // 90万 × 2/15
    6_0000_00 //  90万 × 1/15
  ]);
});

test("双倍余额递减法：前期按净值 × 2/n，最后两年转直线", () => {
  const schedule = acceleratedScheduleCents({ ...BASE, method: "double_declining" });

  // 年折旧率 2/5 = 40%，前三年按**账面净值**（不减残值）算：
  //   第 1 年 100万 × 40% = 40万，净值余 60万
  //   第 2 年  60万 × 40% = 24万，净值余 36万
  //   第 3 年  36万 × 40% = 14.4万，净值余 21.6万
  // 最后两年转直线：(21.6万 − 残值 10万) ÷ 2 = 5.8万/年
  assert.deepEqual(schedule, [
    40_0000_00,
    24_0000_00,
    14_4000_00,
    5_8000_00,
    5_8000_00
  ]);
});

test("两种方法的合计都等于可折旧总额——不能多提也不能少提", () => {
  for (const method of ["sum_of_years", "double_declining"] as const) {
    const total = acceleratedScheduleCents({ ...BASE, method }).reduce((a, b) => a + b, 0);
    assert.equal(
      total,
      BASE.originalCostCents - BASE.salvageValueCents,
      `${method} 合计对不上可折旧总额 —— 多提是虚增税前扣除，少提是纳税人吃亏`
    );
  }
});

test("双倍余额递减法不转直线会提过头，跌破残值——这才是最后两年要转的原因", () => {
  // 一直按 40% 递减五年：100 → 60 → 36 → 21.6 → 12.96 → 7.776（万元）。
  // 末净值 7.776 万 < 残值 10 万 —— **提过头了**，多扣的部分是虚增税前扣除。
  //
  // 这条钉住「为什么要转直线」。写这条时我先按「会提不完」的直觉断言，跑出来才
  // 发现方向反了：这个方法前期不扣残值，跑满全程是穿透残值而不是留有余额。
  const rate = 2 / BASE.lifeYears;
  let netValue = BASE.originalCostCents;
  for (let year = 0; year < BASE.lifeYears; year += 1) netValue -= Math.floor(netValue * rate);
  assert.ok(
    netValue < BASE.salvageValueCents,
    "一直递减下去净值会跌破残值，多提的部分就是虚增的税前扣除"
  );

  // 而转了直线之后正好收口在残值上
  const schedule = acceleratedScheduleCents({ ...BASE, method: "double_declining" });
  const endingNetValue =
    BASE.originalCostCents - schedule.reduce((a, b) => a + b, 0);
  assert.equal(endingNetValue, BASE.salvageValueCents);
});

test("残值为 0 时双倍余额递减法照样收口到 0", () => {
  const schedule = acceleratedScheduleCents({
    originalCostCents: 60_0000_00,
    salvageValueCents: 0,
    lifeYears: 3,
    method: "double_declining"
  });
  assert.equal(schedule.reduce((a, b) => a + b, 0), 60_0000_00);
  assert.equal(schedule.length, 3);
});

test("整除不尽时末期扫尾，不留浮点尾巴", () => {
  // 10 万 ÷ 3 年，年数总和法：分母 6，权重 3/2/1
  const schedule = acceleratedScheduleCents({
    originalCostCents: 10_0000_00,
    salvageValueCents: 0,
    lifeYears: 3,
    method: "sum_of_years"
  });
  assert.equal(schedule.reduce((a, b) => a + b, 0), 10_0000_00, "各年之和必须严格等于原值");
  // 每一项都是整数分
  for (const amount of schedule) assert.equal(Number.isInteger(amount), true);
});

test("使用年限为 1 年时不适用加速折旧的分段逻辑", () => {
  // 双倍余额递减法的「最后两年转直线」在只有 1 年时无从分段，
  // 直接把可折旧总额一次提完 —— 不能因为分段逻辑而漏提或报错。
  const schedule = acceleratedScheduleCents({
    originalCostCents: 5_0000_00,
    salvageValueCents: 1_0000_00,
    lifeYears: 1,
    method: "double_declining"
  });
  assert.deepEqual(schedule, [4_0000_00]);
});

test("缩短折旧年限的下限是税法最低年限的 60%", () => {
  assert.equal(MIN_SHORTENED_LIFE_RATIO, 0.6);

  // 设备类税法最低 10 年 → 缩短后不得低于 6 年
  assert.equal(minimumShortenedLifeMonths("equipment"), 72);
  // 房屋建筑物 20 年 → 12 年
  assert.equal(minimumShortenedLifeMonths("building"), 144);
  // 电子设备 3 年 → 1.8 年 = 21.6 个月，向上取整到 22 个月
  //（取整方向必须向上：向下取整会让企业合法地比法定下限多扣一点点）
  assert.equal(minimumShortenedLifeMonths("electronic"), 22);
});
