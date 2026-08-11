import { test } from "node:test";
import assert from "node:assert/strict";
import { INVOICE_TYPES, isInputTaxDeductible, normalizeInvoiceType } from "./invoice-types.js";

test("规范取值集合与 DB CHECK / 前端下拉保持一致", () => {
  assert.deepEqual([...INVOICE_TYPES], [
    "vat_special", "vat_general", "electronic", "receipt", "other"
  ]);
  // vat_common 是 025 演示数据里的笔误，不是独立业务含义，不得进入规范取值。
  assert.ok(!INVOICE_TYPES.includes("vat_common" as never));
});

test("normalizeInvoiceType 原样返回规范取值", () => {
  for (const invoiceType of INVOICE_TYPES) {
    assert.equal(normalizeInvoiceType(invoiceType), invoiceType);
  }
});

test("normalizeInvoiceType 把存量别名 vat_common 归一到 vat_general", () => {
  assert.equal(normalizeInvoiceType("vat_common"), "vat_general");
});

test("normalizeInvoiceType 容忍大小写与首尾空白", () => {
  assert.equal(normalizeInvoiceType("  VAT_Special "), "vat_special");
  assert.equal(normalizeInvoiceType("VAT_COMMON"), "vat_general");
});

test("normalizeInvoiceType 对无法识别的输入返回 null（供写入路径拒绝）", () => {
  for (const raw of [undefined, null, "", "   ", "vat", "vat_speciall", "增值税专用发票", 123 as never]) {
    assert.equal(normalizeInvoiceType(raw), null, `${JSON.stringify(raw)} 不应被识别`);
  }
});

test("只有增值税专用发票的进项税可抵扣", () => {
  assert.equal(isInputTaxDeductible("vat_special"), true);

  for (const invoiceType of ["vat_general", "electronic", "receipt", "other"]) {
    assert.equal(
      isInputTaxDeductible(invoiceType), false,
      `${invoiceType} 判成可抵扣会直接造成增值税申报少缴税`
    );
  }
});

test("别名与未知取值一律不可抵扣（白名单，错误方向偏向多缴税）", () => {
  assert.equal(isInputTaxDeductible("vat_common"), false);

  for (const raw of [undefined, null, "", "  ", "unknown", "vat_speciall", "VAT_SPECIAL_"]) {
    assert.equal(isInputTaxDeductible(raw), false, `${JSON.stringify(raw)} 不得走抵扣分支`);
  }
});

test("可抵扣判定对大小写与空白稳健", () => {
  assert.equal(isInputTaxDeductible(" VAT_SPECIAL "), true);
});
