import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTaxConsistency } from "./consistency.js";

const base = {
  period: "2026-05",
  invoiceOutputTaxCents: 130000,
  invoiceInputTaxCents: 52000,
  invoiceSalesAmountCents: 1000000,
  declaredOutputTaxCents: 130000,
  declaredInputTaxCents: 52000,
  ledgerRevenueCents: 1000000
};

test("reports ok when invoices, declaration and ledger all agree", () => {
  const report = checkTaxConsistency(base);
  assert.equal(report.overall, "ok");
  assert.equal(report.checks.every((c) => c.severity === "ok"), true);
});

test("flags an output-tax discrepancy beyond tolerance", () => {
  const report = checkTaxConsistency({
    ...base,
    declaredOutputTaxCents: 120000,
    toleranceCents: 100
  });
  const outputTax = report.checks.find((c) => c.key === "output_tax");
  assert.equal(outputTax!.differenceCents, 10000);
  assert.equal(outputTax!.severity, "alert");
  assert.equal(report.overall, "alert");
});

test("classifies a small discrepancy as warning and a large one as alert", () => {
  const warn = checkTaxConsistency({
    ...base,
    declaredInputTaxCents: 51500,
    toleranceCents: 100,
    alertThresholdCents: 1000
  });
  assert.equal(warn.checks.find((c) => c.key === "input_tax")!.severity, "warning");

  const alert = checkTaxConsistency({
    ...base,
    declaredInputTaxCents: 40000,
    toleranceCents: 100,
    alertThresholdCents: 1000
  });
  assert.equal(alert.checks.find((c) => c.key === "input_tax")!.severity, "alert");
});

test("detects invoice sales vs ledger revenue mismatch (票账不一致)", () => {
  const report = checkTaxConsistency({ ...base, ledgerRevenueCents: 900000, toleranceCents: 0 });
  const revenue = report.checks.find((c) => c.key === "invoice_vs_ledger_revenue");
  assert.equal(revenue!.differenceCents, 100000);
  assert.equal(revenue!.severity, "alert");
});

test("honours the tolerance so tiny rounding differences stay ok", () => {
  const report = checkTaxConsistency({
    ...base,
    declaredOutputTaxCents: 129999,
    toleranceCents: 5
  });
  assert.equal(report.checks.find((c) => c.key === "output_tax")!.severity, "ok");
  assert.equal(report.overall, "ok");
});

test("difference sign is invoice minus compared", () => {
  const report = checkTaxConsistency({ ...base, declaredOutputTaxCents: 140000, toleranceCents: 0 });
  assert.equal(report.checks.find((c) => c.key === "output_tax")!.differenceCents, -10000);
});
