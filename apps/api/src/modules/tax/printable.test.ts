import test from "node:test";
import assert from "node:assert/strict";
import type { VatWorkingPaper } from "@finance-taxation/domain-model";
import { buildTaxWorkingPaperPrintableHtml } from "./printable.js";

test("buildTaxWorkingPaperPrintableHtml renders VAT working paper headline", () => {
  const paper: VatWorkingPaper = {
    companyId: "cmp-1",
    filingPeriod: "2026-05",
    taxpayerType: "general_vat",
    outputTaxAmount: "130",
    inputTaxAmount: "39",
    simplifiedTaxAmount: "0",
    payableVatAmount: "91",
    lines: [
      {
        id: "line-1",
        sourceType: "output",
        businessEventId: "evt-1",
        taxItemId: "tx-1",
        description: "销项税额",
        taxRate: "13",
        taxableAmount: "1000",
        taxAmount: "130"
      }
    ]
  };

  const html = buildTaxWorkingPaperPrintableHtml("增值税底稿", paper);
  assert.equal(html.includes("增值税底稿"), true);
  assert.equal(html.includes("应纳增值税"), true);
  assert.equal(html.includes("91"), true);
});
