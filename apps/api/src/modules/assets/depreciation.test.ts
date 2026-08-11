import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  depreciationForPeriod,
  monthlyDepreciationCents,
  periodDiffMonths,
  type DepreciableAsset
} from "./depreciation.js";

/**
 * 原值 12 万、预计净残值 6000、使用 60 个月 → 月折旧 1900.00。
 *
 * 金额一律写成 `元_分` 的分组形式（`1_900_00` = 1900.00 元），避免把
 * 「分」当成「元」—— 这个单位错位在初稿里真实发生过一次。
 */
const asset: DepreciableAsset = {
  originalCostCents: 120_000_00,
  salvageValueCents: 6_000_00,
  usefulLifeMonths: 60,
  depreciationStartPeriod: "2026-02",
  disposedPeriod: null
};

/** 可提折旧总额 = 120000 − 6000 = 114000.00 元。 */
const BASE_CENTS = 114_000_00;

test("月折旧额 =（原值 − 预计净残值）÷ 预计使用月数", () => {
  assert.equal(monthlyDepreciationCents(asset), 1_900_00);
});

test("除不尽时月折旧向下取整，余数留给最后一期扫尾", () => {
  // (100.00 − 0) / 3 = 33.333...，向下取整到 33.33
  const odd: DepreciableAsset = {
    ...asset,
    originalCostCents: 100_00,
    salvageValueCents: 0,
    usefulLifeMonths: 3
  };
  assert.equal(monthlyDepreciationCents(odd), 33_33);
});

test("当月增加的固定资产当月不提折旧，从次月起提", () => {
  // depreciationStartPeriod 已是购置次月；购置当月即 2026-01
  const before = depreciationForPeriod(asset, "2026-01", 0);
  assert.equal(before.amountCents, 0);
  assert.equal(before.reason, "not_started");

  const first = depreciationForPeriod(asset, "2026-02", 0);
  assert.equal(first.amountCents, 1_900_00);
  assert.equal(first.reason, "normal");
});

test("当月减少的固定资产当月照提，次月起停提", () => {
  const disposed: DepreciableAsset = { ...asset, disposedPeriod: "2026-05" };

  // 2026-02/03/04 已提三个月
  const onDisposalMonth = depreciationForPeriod(disposed, "2026-05", 5_700_00);
  assert.equal(onDisposalMonth.amountCents, 1_900_00, "处置当月仍应计提");
  assert.equal(onDisposalMonth.reason, "normal");

  const afterDisposal = depreciationForPeriod(disposed, "2026-06", 7_600_00);
  assert.equal(afterDisposal.amountCents, 0);
  assert.equal(afterDisposal.reason, "disposed");
});

test("已提足折旧的固定资产不再计提，即使仍在使用", () => {
  const fullyDepreciated = depreciationForPeriod(asset, "2031-03", BASE_CENTS);
  assert.equal(fullyDepreciated.amountCents, 0);
  assert.equal(fullyDepreciated.reason, "fully_depreciated");
});

test("最后一期扫尾：累计折旧恰好等于原值 − 残值，一分不差", () => {
  const odd: DepreciableAsset = {
    ...asset,
    originalCostCents: 100_00,
    salvageValueCents: 0,
    usefulLifeMonths: 3,
    depreciationStartPeriod: "2026-01"
  };
  const monthly = monthlyDepreciationCents(odd); // 33.33

  const m1 = depreciationForPeriod(odd, "2026-01", 0);
  const m2 = depreciationForPeriod(odd, "2026-02", m1.amountCents);
  const m3 = depreciationForPeriod(odd, "2026-03", m1.amountCents + m2.amountCents);

  assert.equal(m1.amountCents, monthly);
  assert.equal(m2.amountCents, monthly);
  // 余数 0.01 由最后一期补齐，而不是溢出成第 4 期
  assert.equal(m3.amountCents, 100_00 - monthly * 2);
  assert.equal(m3.reason, "final_trim");
  assert.equal(m1.amountCents + m2.amountCents + m3.amountCents, 100_00);
});

test("除不尽的余数不会溢出成额外一期", () => {
  const odd: DepreciableAsset = {
    ...asset,
    originalCostCents: 100_00,
    salvageValueCents: 0,
    usefulLifeMonths: 3,
    depreciationStartPeriod: "2026-01"
  };
  // 三期提完后，第四期一分不提
  const m4 = depreciationForPeriod(odd, "2026-04", 100_00);
  assert.equal(m4.amountCents, 0);
  assert.equal(m4.reason, "fully_depreciated");
});

test("末期扫尾金额不会超过剩余可提折旧额", () => {
  // 已提 113900，只剩 100.00 可提，而标准月折旧是 1900.00
  const outcome = depreciationForPeriod(asset, "2031-01", 113_900_00);
  assert.equal(outcome.amountCents, 100_00);
  assert.equal(outcome.reason, "final_trim");
});

test("残值等于原值时一分不提", () => {
  const noDepreciation: DepreciableAsset = { ...asset, salvageValueCents: asset.originalCostCents };
  assert.equal(monthlyDepreciationCents(noDepreciation), 0);
  assert.equal(depreciationForPeriod(noDepreciation, "2026-02", 0).amountCents, 0);
});

test("处置期间早于开始折旧期间时一分不提", () => {
  // 购置当月即处置：start = 次月，disposed = 当月
  const flipped: DepreciableAsset = {
    ...asset,
    depreciationStartPeriod: "2026-02",
    disposedPeriod: "2026-01"
  };
  assert.equal(depreciationForPeriod(flipped, "2026-02", 0).amountCents, 0);
});

test("整条生命周期累计折旧精确等于原值 − 残值", () => {
  let accumulated = 0;
  let period = asset.depreciationStartPeriod;
  // 多跑 6 期，验证提足后不再多提
  for (let i = 0; i < asset.usefulLifeMonths + 6; i += 1) {
    accumulated += depreciationForPeriod(asset, period, accumulated).amountCents;
    period = addMonths(period, 1);
  }
  assert.equal(accumulated, BASE_CENTS);
});

test("periodDiffMonths 跨年正确", () => {
  assert.equal(periodDiffMonths("2026-01", "2026-01"), 0);
  assert.equal(periodDiffMonths("2026-01", "2026-12"), 11);
  assert.equal(periodDiffMonths("2026-01", "2027-03"), 14);
  assert.equal(periodDiffMonths("2027-03", "2026-01"), -14);
});

test("addMonths 跨年进位正确", () => {
  assert.equal(addMonths("2026-01", 1), "2026-02");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-11", 14), "2028-01");
  assert.equal(addMonths("2026-01", 0), "2026-01");
});

test("非法期间格式直接抛错，不静默当成 0", () => {
  assert.throws(() => periodDiffMonths("2026-13", "2026-01"), /YYYY-MM/);
  assert.throws(() => addMonths("2026-1", 1), /YYYY-MM/);
});
