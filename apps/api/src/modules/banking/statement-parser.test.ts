import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBankStatementCsv } from "./statement-parser.js";

const CMB_CSV = `交易日期,记账日期,交易金额,账户余额,摘要,对方账号,对方户名
2026-05-10,2026-05-10,50000.00,150000.00,工程款收入,6226200012345678,客户A
2026-05-12,2026-05-12,-30000.00,120000.00,供应商付款,6226200087654321,供应商B
`;

test("detects CMB format", () => {
  const result = parseBankStatementCsv(CMB_CSV);
  assert.equal(result.detectedFormat, "cmb", "detects CMB format");
  assert.equal(result.rows.length, 2, "parses 2 rows");
});

test("parses CMB amounts correctly", () => {
  const result = parseBankStatementCsv(CMB_CSV);
  assert.equal(result.rows[0]!.amount, 50000, "income is positive");
  assert.equal(result.rows[1]!.amount, -30000, "payment is negative");
});

test("parses CMB counterparty", () => {
  const result = parseBankStatementCsv(CMB_CSV);
  assert.equal(result.rows[0]!.counterpartyName, "客户A");
  assert.equal(result.rows[1]!.counterpartyNo, "6226200087654321");
});

const ICBC_CSV = `记账日期,借方发生额,贷方发生额,余额,交易摘要
2026-05-10,,80000.00,180000.00,货款到账
2026-05-15,20000.00,,160000.00,办公用品采购
`;

test("detects ICBC format", () => {
  const result = parseBankStatementCsv(ICBC_CSV);
  assert.equal(result.detectedFormat, "icbc", "detects ICBC format");
});

test("parses ICBC debit/credit correctly", () => {
  const result = parseBankStatementCsv(ICBC_CSV);
  assert.equal(result.rows[0]!.amount, 80000, "credit is positive");
  assert.equal(result.rows[1]!.amount, -20000, "debit is negative");
});

const GENERIC_CSV = `日期,摘要,借方,贷方,余额
2026-05-01,工资发放,50000,,100000
2026-05-03,客户回款,,30000,130000
`;

test("detects generic format", () => {
  const result = parseBankStatementCsv(GENERIC_CSV);
  assert.equal(result.detectedFormat, "generic", "detects generic format");
  assert.equal(result.rows.length, 2, "parses 2 rows");
});

test("handles BOM in CSV", () => {
  const csvWithBom = "﻿" + GENERIC_CSV;
  const result = parseBankStatementCsv(csvWithBom);
  assert.ok(result.rows.length > 0, "parses despite BOM");
});

test("skips comment lines", () => {
  const csvWithComments = "# 这是注释\n" + CMB_CSV;
  const result = parseBankStatementCsv(csvWithComments);
  assert.ok(result.rows.length > 0, "skips # comment lines");
});

test("generates transaction_ref when missing", () => {
  const result = parseBankStatementCsv(GENERIC_CSV);
  assert.ok(result.rows[0]!.transactionRef !== null, "ref generated for generic format");
});

test("returns empty for empty input", () => {
  const result = parseBankStatementCsv("");
  assert.equal(result.rows.length, 0, "empty input returns no rows");
});
