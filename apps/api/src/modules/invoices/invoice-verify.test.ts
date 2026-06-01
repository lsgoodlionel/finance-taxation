import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyInvoiceLocally } from "./invoice-verify.js";

// ── verifyInvoiceLocally (P1 rules, P2 fallback) ──────────────────────────────

test("passes valid invoice", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode:  "3100194130",
    invoiceNo:    "12345678",
    invoiceDate:  "2026-01-15",
    totalAmount:  1130.00,
    sellerTaxNo:  "91310101MA1FL4LC06",
  });
  assert.equal(result.status, "verified", "valid invoice should pass");
});

test("rejects invoice with bad invoice number", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "3100194130", invoiceNo: "1234", // < 8 digits
    invoiceDate: "2026-01-15", totalAmount: 1000, sellerTaxNo: "X",
  });
  assert.equal(result.status, "invalid", "short invoice number should fail");
  assert.ok(result.message.includes("号码"), "message mentions number");
});

test("rejects invoice with zero amount", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "3100194130", invoiceNo: "12345678",
    invoiceDate: "2026-01-15", totalAmount: 0, sellerTaxNo: "X",
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.message.includes("金额"));
});

test("rejects future invoice date", async () => {
  const future = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  const result = await verifyInvoiceLocally({
    invoiceCode: "3100194130", invoiceNo: "12345678",
    invoiceDate: future, totalAmount: 1000, sellerTaxNo: "X",
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.message.includes("今日"), "message mentions future date");
});

test("rejects pre-2015 invoice date", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "3100194130", invoiceNo: "12345678",
    invoiceDate: "2010-06-01", totalAmount: 1000, sellerTaxNo: "X",
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.message.includes("2015"), "message mentions year limit");
});

test("rejects invalid invoice code length", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "12345",   // not 10 or 12 digits
    invoiceNo: "12345678",
    invoiceDate: "2026-01-15", totalAmount: 1000, sellerTaxNo: "X",
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.message.includes("代码"));
});

test("accepts 12-digit invoice code", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "310019413001",   // 12 digits - new format
    invoiceNo: "12345678",
    invoiceDate: "2026-01-15", totalAmount: 1000, sellerTaxNo: "",
  });
  assert.equal(result.status, "verified", "12-digit code should pass");
});

test("accepts empty invoice code (optional field)", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "",
    invoiceNo: "12345678",
    invoiceDate: "2026-01-15", totalAmount: 1000, sellerTaxNo: "",
  });
  assert.equal(result.status, "verified", "empty code is OK");
});

test("accumulates multiple issues", async () => {
  const result = await verifyInvoiceLocally({
    invoiceCode: "123",           // bad code
    invoiceNo: "123",             // bad number
    invoiceDate: "2010-01-01",   // pre-2015
    totalAmount: 0,               // zero amount
    sellerTaxNo: "",
  });
  assert.equal(result.status, "invalid");
  // multiple issues joined with ；
  assert.ok(result.message.includes("；"), "multiple issues reported");
});

// ── Provider config validation ────────────────────────────────────────────────

import { testInvoiceVerifyProvider } from "./invoice-verify.js";

test("local provider always passes test", async () => {
  const result = await testInvoiceVerifyProvider({
    provider: "local", apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
  });
  assert.equal(result.ok, true, "local provider test always ok");
});

test("baiwang requires apiKey and appId", async () => {
  const result = await testInvoiceVerifyProvider({
    provider: "baiwang", apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
  });
  assert.equal(result.ok, false, "baiwang without keys should fail");
  assert.ok(result.message.includes("appId") || result.message.includes("API"), "mentions missing field");
});

test("nuonuo requires apiKey and apiSecret", async () => {
  const result = await testInvoiceVerifyProvider({
    provider: "nuonuo", apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
  });
  assert.equal(result.ok, false);
});

test("custom provider requires endpointUrl", async () => {
  const result = await testInvoiceVerifyProvider({
    provider: "custom", apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("Endpoint") || result.message.includes("endpointUrl"));
});
