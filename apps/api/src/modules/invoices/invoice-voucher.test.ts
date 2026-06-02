import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceVoucherDraft, isVoucherBalanced, type InvoiceForVoucher } from "./invoice-voucher.js";

const INPUT: InvoiceForVoucher = {
  direction: "input", sellerName: "供应商A", buyerName: "本公司", invoiceNo: "12345678",
  amount: 1000, taxAmount: 130, totalAmount: 1130,
};
const OUTPUT: InvoiceForVoucher = {
  direction: "output", sellerName: "本公司", buyerName: "客户B", invoiceNo: "87654321",
  amount: 2000, taxAmount: 260, totalAmount: 2260,
};

test("进项发票生成付款类凭证且借贷平衡", () => {
  const d = buildInvoiceVoucherDraft(INPUT);
  assert.equal(d.voucherType, "payment");
  assert.ok(isVoucherBalanced(d));
  const debit = d.lines.reduce((s, l) => s + Number(l.debit), 0);
  assert.equal(debit, 1130); // 1000 费用 + 130 进项税
});

test("销项发票生成计提类凭证且借贷平衡", () => {
  const d = buildInvoiceVoucherDraft(OUTPUT);
  assert.equal(d.voucherType, "accrual");
  assert.ok(isVoucherBalanced(d));
  const credit = d.lines.reduce((s, l) => s + Number(l.credit), 0);
  assert.equal(credit, 2260); // 2000 收入 + 260 销项税
});

test("无税额时省略税金行仍平衡", () => {
  const d = buildInvoiceVoucherDraft({ ...INPUT, taxAmount: 0, totalAmount: 1000 });
  assert.equal(d.lines.length, 2);
  assert.ok(isVoucherBalanced(d));
});

test("totalAmount 缺失时由 amount+tax 推算", () => {
  const d = buildInvoiceVoucherDraft({ ...INPUT, totalAmount: 0 });
  assert.ok(isVoucherBalanced(d));
  const credit = d.lines.reduce((s, l) => s + Number(l.credit), 0);
  assert.equal(credit, 1130);
});

test("含小数金额仍保持平衡", () => {
  const d = buildInvoiceVoucherDraft({ ...OUTPUT, amount: 1999.99, taxAmount: 260.01, totalAmount: 2260 });
  assert.ok(isVoucherBalanced(d));
});
