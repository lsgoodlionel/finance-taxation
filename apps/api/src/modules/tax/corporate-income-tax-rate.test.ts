import assert from "node:assert/strict";
import test from "node:test";
import { resolveCorporateIncomeTaxTreatment } from "./corporate-income-tax-rate.js";

/**
 * 企业所得税优惠资格判定（V17 阶段三批次 A）。
 *
 * 缺陷背景：`buildCorporateIncomeTaxPreparation` 此前写死 25%，
 * 高新技术企业（15%）与小型微利企业（实际 5%）都被按一般税率算。
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md`。
 */

/** 一份资格齐备的小微企业档案：四个条件都满足。 */
function smallProfitQualification() {
  return {
    employeeCount: 50,
    totalAssetsCents: 1_000_000_00,
    isRestrictedIndustry: false,
    highTechCertificateExpiresOn: null
  };
}

test("一般企业按 25%", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 5_000_000_00, // 500 万，超过小微的 300 万线
    qualification: { ...smallProfitQualification(), employeeCount: 500 },
    on: "2026-08-31"
  });

  assert.equal(result.kind, "standard");
  assert.equal(result.effectiveRatePercent, 25);
  assert.equal(result.taxAmountCents, 1_250_000_00, "500 万 × 25% = 125 万");
});

test("高新技术企业按 15%", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 5_000_000_00,
    qualification: {
      ...smallProfitQualification(),
      employeeCount: 500,
      highTechCertificateExpiresOn: "2027-12-31"
    },
    on: "2026-08-31"
  });

  assert.equal(result.kind, "high_tech");
  assert.equal(result.effectiveRatePercent, 15);
  assert.equal(result.taxAmountCents, 750_000_00, "500 万 × 15% = 75 万");
});

test("过期的高新资质不再享受优惠", () => {
  // 资质是有有效期的。过期之后仍按 15% 算，等于帮客户少缴税——
  // 那不是「对客户好」，那是把补税和滞纳金推给以后的自己。
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 5_000_000_00,
    qualification: {
      ...smallProfitQualification(),
      employeeCount: 500,
      highTechCertificateExpiresOn: "2025-12-31"
    },
    on: "2026-08-31"
  });

  assert.equal(result.kind, "standard", "过期就按一般税率");
  assert.equal(result.effectiveRatePercent, 25);
});

test("小型微利：减按 25% 计入，再按 20% 征——实际 5%", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00, // 100 万
    qualification: smallProfitQualification(),
    on: "2026-08-31"
  });

  assert.equal(result.kind, "small_profit");
  assert.equal(result.taxAmountCents, 50_000_00, "100 万 × 25% × 20% = 5 万");

  // **两个系数要分别拿得到。** 写死 5% 在数值上一样，但申报表要分别列示
  // 「减免税额」，而且历史上这两个系数分别调整过——合成一个数就还原不出来。
  assert.equal(result.reducedInclusionPercent, 25, "减按 25% 计入应纳税所得额");
  assert.equal(result.appliedRatePercent, 20, "按 20% 税率征收");
  assert.equal(result.effectiveRatePercent, 5, "合起来实际税负 5%");
});

test("应纳税所得额超过 300 万就不是小型微利", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 3_000_001_00, // 刚过 300 万一分
    qualification: smallProfitQualification(),
    on: "2026-08-31"
  });

  assert.equal(result.kind, "standard", "超一分钱都不是小微");
  assert.equal(result.effectiveRatePercent, 25);
});

test("300 万整仍然是小型微利——阈值是「不超过」", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 3_000_000_00,
    qualification: smallProfitQualification(),
    on: "2026-08-31"
  });

  assert.equal(result.kind, "small_profit", "「不超过 300 万」含 300 万本身");
});

test("从业人数或资产总额超标，不是小型微利", () => {
  const tooManyPeople = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00,
    qualification: { ...smallProfitQualification(), employeeCount: 301 },
    on: "2026-08-31"
  });
  assert.equal(tooManyPeople.kind, "standard", "从业人数上限 300 人");

  const tooManyAssets = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00,
    qualification: { ...smallProfitQualification(), totalAssetsCents: 5_000_000_01_00 },
    on: "2026-08-31"
  });
  assert.equal(tooManyAssets.kind, "standard", "资产总额上限 5000 万");
});

test("限制或禁止行业不享受小微优惠", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00,
    qualification: { ...smallProfitQualification(), isRestrictedIndustry: true },
    on: "2026-08-31"
  });
  assert.equal(result.kind, "standard");
});

test("资格信息缺失时不按 25% 兜底，报「待确认」", () => {
  // **这是整个批次里最重要的一条。**
  //
  // 按 25% 兜底看起来「保守稳妥」，实际上是让企业**多交钱**——
  // 一家本该按 5% 的小微企业会按 25% 预缴，多交五倍，
  // 而用户完全看不出这个数字是猜的。
  //
  // 与增值税那边「税目未知不按 13% 兜底」是同一件事：
  // 两者都是按最高档兜底，都是静默地让企业多交。
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00,
    qualification: { ...smallProfitQualification(), employeeCount: null },
    on: "2026-08-31"
  });

  assert.equal(result.kind, "unknown");
  assert.equal(result.taxAmountCents, null, "算不出就不给数字");
  assert.match(
    result.reason,
    /从业人数/,
    "要说清缺哪一项——用户得知道去补什么，而不是面对一句「无法计算」"
  );
});

test("资产总额缺失同样报「待确认」", () => {
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 1_000_000_00,
    qualification: { ...smallProfitQualification(), totalAssetsCents: null },
    on: "2026-08-31"
  });
  assert.equal(result.kind, "unknown");
  assert.match(result.reason, /资产总额/);
});

test("资格缺失但已经超过小微上限时，按一般税率算得出来", () => {
  // 应纳税所得额已经 500 万，无论人数和资产多少都不可能是小微——
  // 这时缺信息不影响结论，不该拦着用户。
  //
  // 「信息不全就一律报待确认」会让这个功能在多数情况下不可用；
  // **不确定的是结论，不是信息的完整度。**
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: 5_000_000_00,
    qualification: { ...smallProfitQualification(), employeeCount: null, totalAssetsCents: null },
    on: "2026-08-31"
  });

  assert.equal(result.kind, "standard", "已超小微所得额上限，缺的信息不改变结论");
  assert.equal(result.taxAmountCents, 1_250_000_00);
});

test("亏损年度：应纳税所得额为负，税额为 0 而不是负数", () => {
  // 亏损不缴税，但**亏损本身要结转以后年度弥补**。
  // 税额是 0，可结转的亏损额不是 0——这两个数不能混。
  const result = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: -800_000_00,
    qualification: smallProfitQualification(),
    on: "2026-08-31"
  });

  assert.equal(result.taxAmountCents, 0, "亏损年度不缴税");
  assert.equal(
    result.carryforwardLossCents,
    800_000_00,
    "可结转以后年度弥补的亏损额要带出来——此前它被 Math.max(x, 0) 抹平了"
  );
});
