import test from "node:test";
import assert from "node:assert/strict";
import type { TaxItem, TaxpayerProfile } from "@finance-taxation/domain-model";
import { buildVatWorkingPaper } from "./vat-working-paper.js";
import type { TaxRate } from "./tax-rate.js";

/**
 * 与迁移 066 内置税率同口径的最小子集（V12-D2）。
 *
 * 纯函数测试不连库，这里手写；迁移里的数据与解析结果由
 * tax-rate.integration.test.ts 在真实库上验证，两边不会各说各话。
 */
const RATES: TaxRate[] = [
  {
    id: "r13", companyId: null, taxType: "vat", code: "vat_basic", name: "13%",
    rate: 13, levyRate: null, taxpayerType: "general_vat", applicableScope: "",
    effectiveFrom: "2019-04-01", effectiveTo: null, sortOrder: 10
  },
  {
    id: "s3", companyId: null, taxType: "vat", code: "vat_small", name: "3%",
    rate: 3, levyRate: null, taxpayerType: "small_scale", applicableScope: "",
    effectiveFrom: "2016-05-01", effectiveTo: "2022-12-31", sortOrder: 60
  },
  {
    // 财政部 税务总局公告 2023 年第 19 号：3% 征收率减按 1% 征收
    id: "s1", companyId: null, taxType: "vat", code: "vat_small", name: "3% 减按 1%",
    rate: 3, levyRate: 1, taxpayerType: "small_scale", applicableScope: "",
    effectiveFrom: "2023-01-01", effectiveTo: "2027-12-31", sortOrder: 60
  }
];

/** 把一组税目改到指定属期，用来验证同一批业务在不同年份的税率差异。 */
function itemsInPeriod(source: TaxItem[], filingPeriod: string): TaxItem[] {
  return source.map((item) => ({ ...item, filingPeriod }));
}

const items: TaxItem[] = [
  {
    id: "tx-1",
    companyId: "cmp-1",
    businessEventId: "evt-sales",
    mappingId: "m-1",
    taxType: "增值税",
    treatment: "销项税额",
    basis: "1000",
    filingPeriod: "2026-05",
    status: "ready",
    source: "analysis",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  },
  {
    id: "tx-2",
    companyId: "cmp-1",
    businessEventId: "evt-proc",
    mappingId: "m-2",
    taxType: "增值税",
    treatment: "进项税额",
    basis: "300",
    filingPeriod: "2026-05",
    status: "ready",
    source: "analysis",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  }
];

test("buildVatWorkingPaper computes general taxpayer payable vat", () => {
  const profile: TaxpayerProfile = {
    id: "tp-1",
    companyId: "cmp-1",
    taxpayerType: "general_vat",
    effectiveFrom: "2026-01-01",
    status: "active",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  const paper = buildVatWorkingPaper(profile, items, "2026-05", RATES);
  assert.equal(paper.outputTaxAmount, "130");
  assert.equal(paper.inputTaxAmount, "39");
  assert.equal(paper.payableVatAmount, "91");
});

test("buildVatWorkingPaper computes small-scale payable vat", () => {
  const profile: TaxpayerProfile = {
    id: "tp-2",
    companyId: "cmp-1",
    taxpayerType: "small_scale",
    effectiveFrom: "2026-01-01",
    status: "active",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  // 断言从 30 改成 10 —— 这条测试原本钉住的是一个**错的**行为。
  // 2023-01-01 起小规模纳税人适用 3% 征收率的收入减按 1% 征收
  //（财政部 税务总局公告 2023 年第 19 号），按 3% 算就是让客户多缴税。
  // 旧实现把 0.03 写死在底稿里，连"当时是多少"都无从表达。
  const paper = buildVatWorkingPaper(profile, items, "2026-05", RATES);
  assert.equal(paper.simplifiedTaxAmount, "10");
  assert.equal(paper.payableVatAmount, "10");
});

test("小规模纳税人在减征生效前仍按 3% 征收率", () => {
  const profile: TaxpayerProfile = {
    id: "tp-2",
    companyId: "cmp-1",
    taxpayerType: "small_scale",
    effectiveFrom: "2016-01-01",
    status: "active",
    notes: "",
    createdAt: "2016-01-01T00:00:00.000Z",
    updatedAt: "2016-01-01T00:00:00.000Z"
  };
  const paper = buildVatWorkingPaper(profile, itemsInPeriod(items, "2022-05"), "2022-05", RATES);
  assert.equal(paper.payableVatAmount, "30", "2022 年还没有减征，仍是 3%");
});

test("找不到适用税率时算出 0 而不是套一个看着合理的错数", () => {
  const profile: TaxpayerProfile = {
    id: "tp-3",
    companyId: "cmp-1",
    taxpayerType: "small_scale",
    effectiveFrom: "2010-01-01",
    status: "active",
    notes: "",
    createdAt: "2010-01-01T00:00:00.000Z",
    updatedAt: "2010-01-01T00:00:00.000Z"
  };
  // 2015 年在内置税率的生效区间之前
  const paper = buildVatWorkingPaper(profile, itemsInPeriod(items, "2015-05"), "2015-05", RATES);
  assert.equal(paper.payableVatAmount, "0", "显眼的 0 会被追问，看着合理的错数会被签字通过");
});
