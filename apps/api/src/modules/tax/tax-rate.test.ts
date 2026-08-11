import test from "node:test";
import assert from "node:assert/strict";
import {
  describeRate,
  effectiveRateOf,
  isEffectiveOn,
  listEffectiveRates,
  resolveTaxRate,
  type TaxRate
} from "./tax-rate.js";

function rate(overrides: Partial<TaxRate> & Pick<TaxRate, "id" | "code" | "rate" | "effectiveFrom">): TaxRate {
  return {
    companyId: null,
    taxType: "vat",
    name: overrides.code,
    levyRate: null,
    taxpayerType: null,
    applicableScope: "",
    effectiveTo: null,
    sortOrder: 0,
    ...overrides
  };
}

/** 增值税基本税率的真实沿革：17% → 16%（2018-05-01）→ 13%（2019-04-01）。 */
const BASIC_HISTORY: TaxRate[] = [
  rate({ id: "r17", code: "vat_basic", rate: 17, effectiveFrom: "2016-05-01", effectiveTo: "2018-04-30" }),
  rate({ id: "r16", code: "vat_basic", rate: 16, effectiveFrom: "2018-05-01", effectiveTo: "2019-03-31" }),
  rate({ id: "r13", code: "vat_basic", rate: 13, effectiveFrom: "2019-04-01" })
];

test("按业务发生日取税率，而不是取最新的那档", () => {
  const q = (on: string) => resolveTaxRate(BASIC_HISTORY, { taxType: "vat", code: "vat_basic", on })?.rate;

  assert.equal(q("2017-06-15"), 17, "2017 年的账要用当时的 17%");
  assert.equal(q("2018-06-15"), 16);
  assert.equal(q("2026-06-15"), 13);
});

test("生效区间两端都是闭的——改版当天用新税率，前一天用旧的", () => {
  const q = (on: string) => resolveTaxRate(BASIC_HISTORY, { taxType: "vat", code: "vat_basic", on })?.rate;

  assert.equal(q("2018-04-30"), 17, "改版前一天仍是旧税率");
  assert.equal(q("2018-05-01"), 16, "改版当天即适用新税率");
  assert.equal(q("2019-03-31"), 16);
  assert.equal(q("2019-04-01"), 13);
});

test("区间之外返回 null，不兜底成某个常见值", () => {
  // 2016-05-01 营改增之前没有这档税率
  assert.equal(resolveTaxRate(BASIC_HISTORY, { taxType: "vat", code: "vat_basic", on: "2015-01-01" }), null);
  // 兜底会把"这笔业务该用哪档税率"这个问题静默糊弄过去
  assert.equal(resolveTaxRate(BASIC_HISTORY, { taxType: "vat", code: "不存在", on: "2026-06-01" }), null);
});

test("减征：算税用实际征收率，底稿两个数都要列", () => {
  // 财政部 税务总局公告 2023 年第 19 号：3% 征收率减按 1% 征收
  const small2023 = rate({
    id: "small23",
    code: "vat_small",
    rate: 3,
    levyRate: 1,
    taxpayerType: "small_scale",
    effectiveFrom: "2023-01-01",
    effectiveTo: "2027-12-31"
  });

  assert.equal(effectiveRateOf(small2023), 1, "算税用 1%，按 3% 算就是让小规模客户多缴税");
  assert.equal(describeRate(small2023), "3% 征收率，减按 1% 征收");
});

test("未减征时实际征收率等于法定税率", () => {
  const basic = rate({ id: "b", code: "vat_basic", rate: 13, effectiveFrom: "2019-04-01" });
  assert.equal(effectiveRateOf(basic), 13);
  assert.equal(describeRate(basic), "13%");
});

test("小规模纳税人跨越减征起点：2022 年按 3%，2023 年起按 1%", () => {
  const history: TaxRate[] = [
    rate({
      id: "s3",
      code: "vat_small",
      rate: 3,
      taxpayerType: "small_scale",
      effectiveFrom: "2016-05-01",
      effectiveTo: "2022-12-31"
    }),
    rate({
      id: "s1",
      code: "vat_small",
      rate: 3,
      levyRate: 1,
      taxpayerType: "small_scale",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2027-12-31"
    })
  ];
  const at = (on: string) =>
    effectiveRateOf(resolveTaxRate(history, { taxType: "vat", code: "vat_small", on })!);

  assert.equal(at("2022-12-31"), 3);
  assert.equal(at("2023-01-01"), 1);
});

test("纳税人类型不匹配的税率被排除，不限类型的仍可用", () => {
  const rates: TaxRate[] = [
    rate({ id: "g", code: "vat_basic", rate: 13, taxpayerType: "general_vat", effectiveFrom: "2019-04-01" }),
    rate({ id: "any", code: "vat_property", rate: 5, taxpayerType: null, effectiveFrom: "2016-05-01" })
  ];

  assert.equal(
    resolveTaxRate(rates, { taxType: "vat", code: "vat_basic", on: "2026-06-01", taxpayerType: "small_scale" }),
    null,
    "小规模纳税人用不到一般纳税人的基本税率"
  );
  assert.equal(
    resolveTaxRate(rates, { taxType: "vat", code: "vat_property", on: "2026-06-01", taxpayerType: "small_scale" })?.rate,
    5,
    "taxpayerType 为 null 表示不限，谁都能用"
  );
});

test("公司自定义税率压过同 code 的系统内置", () => {
  const rates: TaxRate[] = [
    rate({ id: "sys", code: "vat_basic", rate: 13, effectiveFrom: "2019-04-01" }),
    rate({ id: "own", code: "vat_basic", rate: 12, companyId: "cmp-1", effectiveFrom: "2019-04-01" })
  ];
  assert.equal(resolveTaxRate(rates, { taxType: "vat", code: "vat_basic", on: "2026-06-01" })?.id, "own");
});

test("税种隔离：增值税的 code 不会命中企业所得税", () => {
  const rates: TaxRate[] = [
    rate({ id: "vat", taxType: "vat", code: "basic", rate: 13, effectiveFrom: "2019-04-01" }),
    rate({ id: "cit", taxType: "cit", code: "basic", rate: 25, effectiveFrom: "2008-01-01" })
  ];
  assert.equal(resolveTaxRate(rates, { taxType: "cit", code: "basic", on: "2026-06-01" })?.rate, 25);
});

test("列出某日可选税率：同 code 只留一条，按 sortOrder 排", () => {
  const rates: TaxRate[] = [
    ...BASIC_HISTORY.map((item) => ({ ...item, sortOrder: 10 })),
    rate({ id: "low", code: "vat_low", rate: 9, effectiveFrom: "2019-04-01", sortOrder: 20 }),
    rate({ id: "svc", code: "vat_service", rate: 6, effectiveFrom: "2016-05-01", sortOrder: 30 })
  ];

  const listed = listEffectiveRates(rates, "vat", "2026-06-01");
  assert.deepEqual(
    listed.map((item) => item.rate),
    [13, 9, 6],
    "历史档的 17%/16% 不该出现在今天的选择器里"
  );
});

test("列出历史某日可选税率时给出的是当时那几档", () => {
  const rates: TaxRate[] = [
    ...BASIC_HISTORY.map((item) => ({ ...item, sortOrder: 10 })),
    rate({ id: "low11", code: "vat_low", rate: 11, effectiveFrom: "2016-05-01", effectiveTo: "2018-04-30", sortOrder: 20 }),
    rate({ id: "low9", code: "vat_low", rate: 9, effectiveFrom: "2019-04-01", sortOrder: 20 })
  ];

  assert.deepEqual(
    listEffectiveRates(rates, "vat", "2017-06-01").map((item) => item.rate),
    [17, 11],
    "2017 年只有 17% 与 11% 两档"
  );
});

test("isEffectiveOn 对开口区间正确", () => {
  const open = rate({ id: "o", code: "c", rate: 6, effectiveFrom: "2016-05-01" });
  assert.equal(isEffectiveOn(open, "2016-04-30"), false);
  assert.equal(isEffectiveOn(open, "2016-05-01"), true);
  assert.equal(isEffectiveOn(open, "2099-12-31"), true, "effectiveTo 为 null 表示仍然有效");
});
