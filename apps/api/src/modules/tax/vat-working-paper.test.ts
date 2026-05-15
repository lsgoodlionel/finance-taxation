import test from "node:test";
import assert from "node:assert/strict";
import type { TaxItem, TaxpayerProfile } from "@finance-taxation/domain-model";
import { buildVatWorkingPaper } from "./vat-working-paper.js";

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
  const paper = buildVatWorkingPaper(profile, items, "2026-05");
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
  const paper = buildVatWorkingPaper(profile, items, "2026-05");
  assert.equal(paper.simplifiedTaxAmount, "30");
  assert.equal(paper.payableVatAmount, "30");
});
