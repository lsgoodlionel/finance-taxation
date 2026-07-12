import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEInvoice } from "./einvoice-parse.js";

const valid = {
  invoiceNumber: "25012000000012345678",
  issueDate: "2026-05-12",
  sellerTaxNo: "91110000AAAAAAAAAA",
  buyerTaxNo: "91110000BBBBBBBBBB",
  amount: "1000.00",
  tax: "130.00",
  total: "1130.00"
};

test("parses a valid 数电票 and converts amounts to cents", () => {
  const result = parseEInvoice(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(
    { a: result.invoice!.amountCents, t: result.invoice!.taxCents, tot: result.invoice!.totalCents },
    { a: 100000, t: 13000, tot: 113000 }
  );
});

test("rejects when total does not equal amount plus tax", () => {
  const result = parseEInvoice({ ...valid, total: "1200.00" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("价税合计")));
});

test("reports every missing required field", () => {
  const result = parseEInvoice({ amount: "100", tax: "13", total: "113" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("invoiceNumber")));
  assert.ok(result.errors.some((e) => e.includes("sellerTaxNo")));
});

test("rejects a non-object payload", () => {
  assert.equal(parseEInvoice(null).ok, false);
  assert.equal(parseEInvoice([]).ok, false);
  assert.equal(parseEInvoice("x").ok, false);
});

test("rejects non-numeric amounts", () => {
  const result = parseEInvoice({ ...valid, amount: "abc" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("amount")));
});
