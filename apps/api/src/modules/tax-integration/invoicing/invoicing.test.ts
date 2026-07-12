import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceTotals } from "./provider.js";
import { MockInvoiceProvider } from "./mock-provider.js";
import { createInvoiceProvider } from "./factory.js";

const req = {
  sellerTaxNo: "91110000AAAAAAAAAA",
  buyerTaxNo: "91110000BBBBBBBBBB",
  buyerName: "购方公司",
  items: [
    { name: "咨询服务", amountCents: 100000, taxRate: 0.06 },
    { name: "软件许可", amountCents: 200000, taxRate: 0.13 }
  ],
  idempotencyKey: "evt-001"
};

test("computeInvoiceTotals sums amount and tax per line", () => {
  const t = computeInvoiceTotals(req.items);
  assert.equal(t.amountCents, 300000);
  assert.equal(t.taxCents, 6000 + 26000);
  assert.equal(t.totalCents, 300000 + 32000);
});

test("mock provider issues a deterministic invoice number by idempotency key", async () => {
  const p = new MockInvoiceProvider();
  const a = await p.issue(req);
  const b = await p.issue(req);
  assert.equal(a.ok, true);
  assert.equal(a.status, "issued");
  assert.ok(a.invoiceNumber!.startsWith("MOCK"));
  assert.equal(a.invoiceNumber, b.invoiceNumber, "same idempotency key → same invoice");
  assert.equal(a.totalCents, 332000);
});

test("different idempotency keys yield different invoice numbers", async () => {
  const p = new MockInvoiceProvider();
  const a = await p.issue(req);
  const b = await p.issue({ ...req, idempotencyKey: "evt-002" });
  assert.notEqual(a.invoiceNumber, b.invoiceNumber);
});

test("mock provider rejects invalid requests", async () => {
  const p = new MockInvoiceProvider();
  assert.equal((await p.issue({ ...req, buyerName: "" })).ok, false);
  assert.equal((await p.issue({ ...req, items: [] })).ok, false);
});

test("mock query validates MOCK-prefixed numbers", async () => {
  const p = new MockInvoiceProvider();
  assert.equal((await p.query("MOCK123")).status, "valid");
  assert.equal((await p.query("REAL999")).status, "not_found");
});

test("factory returns mock by default and a clear-erroring placeholder for nuonuo without credentials", async () => {
  assert.equal(createInvoiceProvider().name, "mock");
  assert.equal(createInvoiceProvider({ kind: "mock" }).name, "mock");
  const nuonuo = createInvoiceProvider({ kind: "nuonuo" });
  const result = await nuonuo.issue(req);
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes("未配置凭证"));
});
