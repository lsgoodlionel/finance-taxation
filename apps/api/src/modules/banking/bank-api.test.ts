import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApiStatement,
  fetchStatements,
  submitPayrollTransfer,
  testBankApiProvider,
  type BankApiConfig,
} from "./bank-api.js";

const MANUAL: BankApiConfig = {
  provider: "manual", apiKey: null, apiSecret: null, appId: null, endpointUrl: null, extraConfig: {},
};

test("normalizeApiStatement 解析标准字段", () => {
  const n = normalizeApiStatement({
    transactionDate: "2026-05-10T00:00:00Z", amount: 1200.5, balance: 50000,
    counterpartyName: "某某公司", transactionRef: "TXN001", description: "货款",
  });
  assert.ok(n);
  assert.equal(n!.transactionDate, "2026-05-10");
  assert.equal(n!.amount, 1200.5);
  assert.equal(n!.transactionRef, "TXN001");
  assert.equal(n!.counterpartyName, "某某公司");
});

test("normalizeApiStatement 兼容拼音/缩写字段名", () => {
  const n = normalizeApiStatement({ jyrq: "2026-05-11", je: "-800", jydh: "S002", dfhm: "供应商", zy: "付款" });
  assert.ok(n);
  assert.equal(n!.transactionDate, "2026-05-11");
  assert.equal(n!.amount, -800);
  assert.equal(n!.transactionRef, "S002");
  assert.equal(n!.counterpartyName, "供应商");
  assert.equal(n!.description, "付款");
});

test("normalizeApiStatement 缺日期或流水号返回 null", () => {
  assert.equal(normalizeApiStatement({ amount: 100 }), null);
  assert.equal(normalizeApiStatement({ transactionDate: "2026-05-10" }), null);
});

test("normalizeApiStatement 非法金额返回 null", () => {
  assert.equal(normalizeApiStatement({ transactionDate: "2026-05-10", transactionRef: "X", amount: "abc" }), null);
});

test("fetchStatements manual 模式提示走 CSV", async () => {
  const r = await fetchStatements(MANUAL, {});
  assert.equal(r.ok, false);
  assert.match(r.message, /手工模式/);
  assert.equal(r.statements.length, 0);
});

test("submitPayrollTransfer manual 模式提示网银上传", async () => {
  const r = await submitPayrollTransfer(MANUAL, { period: "2026-05", lines: [] });
  assert.equal(r.ok, false);
  assert.match(r.message, /手工模式/);
});

test("testBankApiProvider manual 始终可用", async () => {
  const r = await testBankApiProvider(MANUAL);
  assert.equal(r.ok, true);
});

test("testBankApiProvider cmb 缺 endpoint 报错", async () => {
  const r = await testBankApiProvider({ ...MANUAL, provider: "cmb" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Endpoint/);
});
