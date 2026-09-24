import assert from "node:assert/strict";
import test from "node:test";
import {
  rateCodeForCategory,
  resolveVatRateCode,
  taxableCategoryLabel
} from "./taxable-category.js";

/**
 * 应税行为类别 → 税率档的判定（V17 阶段一）。
 *
 * 缺陷背景：`resolveVatRate` 此前对一般纳税人一律返回 13%，不看业务性质。
 * 一家做咨询服务的公司（应适用 6%）会被按 13% 算，多算一倍还多。
 *
 * 政策依据与完整类别清单见 `docs/v17-tax-rate-policy/POLICY-MAP.md`。
 */

test("三档主税率各归各位", () => {
  // 13%：货物、加工修理修配、有形动产租赁
  assert.equal(rateCodeForCategory("goods"), "vat_basic");
  assert.equal(rateCodeForCategory("processing"), "vat_basic");
  assert.equal(rateCodeForCategory("tangible_lease"), "vat_basic");

  // 9%：交通运输、建筑、不动产、土地使用权、农产品
  assert.equal(rateCodeForCategory("transport"), "vat_low");
  assert.equal(rateCodeForCategory("construction"), "vat_low");
  assert.equal(rateCodeForCategory("real_estate_sale"), "vat_low");
  assert.equal(rateCodeForCategory("land_use_right"), "vat_low");

  // 6%：现代服务、金融、生活服务、增值电信、无形资产
  assert.equal(rateCodeForCategory("modern_service"), "vat_service");
  assert.equal(rateCodeForCategory("financial_service"), "vat_service");
  assert.equal(rateCodeForCategory("intangible_asset"), "vat_service");
});

test("土地使用权走 9%，其余无形资产走 6%", () => {
  // 这两条容易混：转让土地使用权虽然也是无形资产，但税率是 9% 不是 6%。
  assert.equal(rateCodeForCategory("land_use_right"), "vat_low");
  assert.equal(rateCodeForCategory("intangible_asset"), "vat_service");
});

test("认不出的类别返回 null，**不给默认档**", () => {
  // 这是整个设计里最重要的一条。
  //
  // 给一个默认值意味着：一笔税目不明的业务会带着某个税率静默进申报表，
  // 而没有人知道那个数字是猜的。与 V16 修增值税 NaN 时的口径一致——
  // 算不出就说算不出。
  assert.equal(rateCodeForCategory(null), null);
  assert.equal(rateCodeForCategory(undefined), null);
  assert.equal(rateCodeForCategory(""), null);
  assert.equal(rateCodeForCategory("不存在的类别"), null);
  assert.equal(rateCodeForCategory("sales"), null, "记账口径的分类不是税目");
});

test("事项上的类别优先于公司默认值", () => {
  // 一家卖货的公司也可能有一笔咨询收入。
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "general_vat",
      eventCategory: "modern_service",
      companyDefaultCategory: "goods"
    }),
    "vat_service"
  );
});

test("事项没指明时回退到公司主营类别", () => {
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "general_vat",
      eventCategory: null,
      companyDefaultCategory: "modern_service"
    }),
    "vat_service",
    "一家做现代服务的公司，一笔没标类别的收入按 6% 算——这正是此前被按 13% 的那种"
  );
});

test("两处都没有类别时返回 null，让上游报「税目待确认」", () => {
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "general_vat",
      eventCategory: null,
      companyDefaultCategory: null
    }),
    null
  );
});

test("小规模走 vat_small，一般纳税人简易计税走 vat_simplified", () => {
  // **两个档不能混**：税率主数据里它们按 taxpayer_type 区分，
  // 而且小规模那档带减征沿革（3% 减按 1%，2023-01-01 起）。
  // 第一版我把小规模也指到 vat_simplified，取不到税率、算出 0——
  // 被既有的减征沿革测试抓住了。
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "small_scale",
      eventCategory: "modern_service",
      companyDefaultCategory: "goods"
    }),
    "vat_small",
    "小规模按自己那档征收率算，业务性质不影响"
  );

  assert.equal(
    resolveVatRateCode({ taxpayerType: "general_simplified", eventCategory: "goods" }),
    "vat_simplified",
    "一般纳税人简易计税是另一档"
  );
});

test("一般纳税人选择简易计税走征收率", () => {
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "general_vat",
      eventCategory: "construction",
      treatment: "老项目选择简易计税"
    }),
    "vat_simplified"
  );
});

test("零税率优先于纳税人身份", () => {
  // 出口业务不因为纳税人是小规模而改按征收率。
  assert.equal(
    resolveVatRateCode({
      taxpayerType: "small_scale",
      eventCategory: "export_zero_rated"
    }),
    "vat_zero",
    "出口零税率优先——判定优先级里它排第一"
  );
});

test("类别有中文说法，用在给用户看的提示里", () => {
  assert.equal(taxableCategoryLabel("modern_service"), "现代服务");
  assert.equal(taxableCategoryLabel("land_use_right"), "转让土地使用权");
});
