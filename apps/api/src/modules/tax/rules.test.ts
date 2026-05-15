import test from "node:test";
import assert from "node:assert/strict";
import type { TaxpayerProfile } from "@finance-taxation/domain-model";
import { resolveFilingPeriod, resolveTaxRuleProfile, resolveVatRate } from "./rules.js";

const generalProfile: TaxpayerProfile = {
  id: "tp-general",
  companyId: "cmp-1",
  taxpayerType: "general_vat",
  effectiveFrom: "2026-01-01",
  status: "active",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const smallProfile: TaxpayerProfile = {
  id: "tp-small",
  companyId: "cmp-1",
  taxpayerType: "small_scale",
  effectiveFrom: "2026-01-01",
  status: "active",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

test("resolveTaxRuleProfile returns monthly VAT filing for general taxpayer", () => {
  const rule = resolveTaxRuleProfile(generalProfile, "增值税");
  assert.equal(rule.filingFrequency, "monthly");
  assert.equal(rule.defaultRate, "13");
});

test("resolveTaxRuleProfile returns quarterly VAT filing for small-scale taxpayer", () => {
  const rule = resolveTaxRuleProfile(smallProfile, "增值税");
  assert.equal(rule.filingFrequency, "quarterly");
  assert.equal(rule.defaultRate, "3");
});

test("resolveFilingPeriod collapses small-scale VAT to quarter", () => {
  assert.equal(resolveFilingPeriod("2026-05-15", smallProfile, "增值税"), "2026-Q2");
  assert.equal(resolveFilingPeriod("2026-05-15", generalProfile, "增值税"), "2026-05");
});

test("resolveVatRate returns simplified rate for small-scale and general rate for general taxpayer", () => {
  assert.equal(resolveVatRate(generalProfile, "销项税额"), "13");
  assert.equal(resolveVatRate(smallProfile, "销项税额"), "3");
});
