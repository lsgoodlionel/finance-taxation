import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MINIMUM_LIFE_YEARS,
  describeAdjustment,
  isOneTimeDeductionEligible,
  ONE_TIME_DEDUCTION_LIMIT_CENTS,
  resolveTaxLife,
  taxDepreciationForYear,
  taxMinimumLifeMonths,
  type TaxDepreciationAsset
} from "./tax-depreciation.js";

function asset(overrides: Partial<TaxDepreciationAsset> = {}): TaxDepreciationAsset {
  return {
    category: "equipment",
    originalCostCents: 120_000_00,
    salvageValueCents: 0,
    accountingLifeMonths: 36,
    acquiredOn: "2026-01-15",
    electsOneTimeDeduction: false,
    ...overrides
  };
}

test("税法最低折旧年限按资产类别（实施条例第六十条）", () => {
  assert.equal(taxMinimumLifeMonths("building"), 240, "房屋建筑物 20 年");
  assert.equal(taxMinimumLifeMonths("equipment"), 120, "生产设备 10 年");
  assert.equal(taxMinimumLifeMonths("tools"), 60, "器具工具家具 5 年");
  assert.equal(taxMinimumLifeMonths("vehicle"), 48, "运输工具 4 年");
  assert.equal(taxMinimumLifeMonths("electronic"), 36, "电子设备 3 年");
});

test("未登记类别兜底到 5 年，而不是不做限制", () => {
  assert.equal(
    taxMinimumLifeMonths("未知类别"),
    DEFAULT_MINIMUM_LIFE_YEARS * 12,
    "不做限制等于默认企业的会计年限总是合规，而那正是要检查的事"
  );
});

test("会计年限短于税法最低年限时按税法年限，且标记出来", () => {
  const life = resolveTaxLife(asset({ category: "equipment", accountingLifeMonths: 36 }));
  assert.equal(life.taxLifeMonths, 120);
  assert.equal(life.shorterThanMinimum, true);
});

test("会计年限长于税法最低年限时不强行拉短——税法定的是下限", () => {
  const life = resolveTaxLife(asset({ category: "electronic", accountingLifeMonths: 60 }));
  assert.equal(life.taxLifeMonths, 60, "企业折得更慢是允许的，不构成差异");
  assert.equal(life.shorterThanMinimum, false);
});

test("年限一致时无纳税调整", () => {
  const result = taxDepreciationForYear({
    asset: asset({ category: "electronic", accountingLifeMonths: 36 }),
    accountingDepreciationCents: 40_000_00,
    taxYear: 2026,
    priorTaxDeductionCents: 0
  });
  assert.equal(result.adjustmentCents, 0);
  assert.equal(result.reason, "aligned");
  assert.match(describeAdjustment(result), /无需纳税调整/);
});

test("会计 3 年、税法 10 年：超提部分纳税调增", () => {
  // 12 万设备，会计按 3 年提（年 4 万），税法按 10 年（年 1.2 万）
  const result = taxDepreciationForYear({
    asset: asset({ category: "equipment", accountingLifeMonths: 36 }),
    accountingDepreciationCents: 40_000_00,
    taxYear: 2026,
    priorTaxDeductionCents: 0
  });
  assert.equal(result.taxDeductionCents, 12_000_00);
  assert.equal(result.adjustmentCents, 28_000_00, "正数=调增");
  assert.equal(result.reason, "tax_minimum_life");
  assert.match(describeAdjustment(result), /纳税调增/);
});

test("一次性扣除：购置当年全额扣原值，大额调减", () => {
  const result = taxDepreciationForYear({
    asset: asset({ originalCostCents: 300_000_00, electsOneTimeDeduction: true }),
    accountingDepreciationCents: 100_000_00,
    taxYear: 2026,
    priorTaxDeductionCents: 0
  });
  assert.equal(result.taxDeductionCents, 300_000_00);
  assert.equal(result.adjustmentCents, -200_000_00, "负数=调减");
  assert.equal(result.reason, "one_time_deduction");
  assert.match(describeAdjustment(result), /纳税调减/);
});

test("一次性扣除的以后年度：税法已扣完，会计折旧全额调增", () => {
  const result = taxDepreciationForYear({
    asset: asset({ originalCostCents: 300_000_00, electsOneTimeDeduction: true }),
    accountingDepreciationCents: 100_000_00,
    taxYear: 2027,
    priorTaxDeductionCents: 300_000_00
  });
  assert.equal(result.taxDeductionCents, 0);
  assert.equal(result.adjustmentCents, 100_000_00);
  assert.equal(result.reason, "one_time_deducted_prior_year");
});

test("超过 500 万的资产不适用一次性扣除", () => {
  assert.equal(
    isOneTimeDeductionEligible({
      category: "equipment",
      originalCostCents: ONE_TIME_DEDUCTION_LIMIT_CENTS + 1,
      acquiredOn: "2026-06-01"
    }),
    false
  );
  assert.equal(
    isOneTimeDeductionEligible({
      category: "equipment",
      originalCostCents: ONE_TIME_DEDUCTION_LIMIT_CENTS,
      acquiredOn: "2026-06-01"
    }),
    true,
    "恰好 500 万仍适用——政策是「不超过」"
  );
});

test("房屋建筑物不适用一次性扣除", () => {
  assert.equal(
    isOneTimeDeductionEligible({
      category: "building",
      originalCostCents: 100_000_00,
      acquiredOn: "2026-06-01"
    }),
    false,
    "政策原文限于「设备、器具」，即房屋建筑物以外的固定资产"
  );
});

test("一次性扣除的政策区间两端闭合", () => {
  const check = (acquiredOn: string) =>
    isOneTimeDeductionEligible({ category: "equipment", originalCostCents: 100_000_00, acquiredOn });

  assert.equal(check("2017-12-31"), false, "政策 2018 年才开始");
  assert.equal(check("2018-01-01"), true);
  assert.equal(check("2027-12-31"), true, "延续至 2027 年末");
  assert.equal(check("2028-01-01"), false, "到期后回到分期折旧");
});

test("选择放弃一次性扣除时按普通规则走", () => {
  // 企业可以放弃优惠，所以这是一个选择而非自动判定
  const result = taxDepreciationForYear({
    asset: asset({ originalCostCents: 300_000_00, electsOneTimeDeduction: false }),
    accountingDepreciationCents: 100_000_00,
    taxYear: 2026,
    priorTaxDeductionCents: 0
  });
  assert.notEqual(result.reason, "one_time_deduction");
});

test("税法年限摊完后不再扣除，最后一年靠剩余额收口", () => {
  const item = asset({ category: "equipment", accountingLifeMonths: 36 });
  // 已扣 11.5 万，只剩 5000，而年额是 1.2 万
  const result = taxDepreciationForYear({
    asset: item,
    accountingDepreciationCents: 0,
    taxYear: 2035,
    priorTaxDeductionCents: 115_000_00
  });
  assert.equal(result.taxDeductionCents, 5_000_00, "不得超过剩余可扣除额");
});

test("整个生命周期的累计调整归零——差异是时间性的", () => {
  // 无残值时严格成立：税前扣除总额与会计折旧总额都等于原值
  const item = asset({
    category: "equipment",
    accountingLifeMonths: 36,
    originalCostCents: 120_000_00,
    salvageValueCents: 0
  });

  let priorTax = 0;
  let totalAdjustment = 0;
  let totalAccounting = 0;

  // 会计 3 年提完（年 4 万），税法 10 年摊完；跑满 10 年
  for (let year = 0; year < 10; year += 1) {
    const accounting = year < 3 ? 40_000_00 : 0;
    totalAccounting += accounting;
    const result = taxDepreciationForYear({
      asset: item,
      accountingDepreciationCents: accounting,
      taxYear: 2026 + year,
      priorTaxDeductionCents: priorTax
    });
    priorTax += result.taxDeductionCents;
    totalAdjustment += result.adjustmentCents;
  }

  assert.equal(totalAccounting, 120_000_00);
  assert.equal(priorTax, 120_000_00, "税法也扣满原值");
  assert.equal(
    totalAdjustment,
    0,
    "累计调整必须归零——不归零意味着凭空多扣或少扣，是实现错误"
  );
});

test("有残值时累计调整差一个残值，那是真实的永久性差异", () => {
  // 一次性扣除扣的是原值全额，会计折旧只到「原值 − 残值」
  const item = asset({
    originalCostCents: 100_000_00,
    salvageValueCents: 10_000_00,
    accountingLifeMonths: 12,
    electsOneTimeDeduction: true
  });

  const first = taxDepreciationForYear({
    asset: item,
    accountingDepreciationCents: 90_000_00,
    taxYear: 2026,
    priorTaxDeductionCents: 0
  });
  const second = taxDepreciationForYear({
    asset: item,
    accountingDepreciationCents: 0,
    taxYear: 2027,
    priorTaxDeductionCents: 100_000_00
  });

  assert.equal(
    first.adjustmentCents + second.adjustmentCents,
    -10_000_00,
    "差额恰是残值：会计计了残值不提折旧，税法一次性扣了原值全额"
  );
});
