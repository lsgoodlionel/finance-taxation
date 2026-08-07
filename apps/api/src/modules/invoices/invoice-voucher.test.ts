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

// ── V12-A4：发票类型 × 进销项的可抵扣性（蓝图 E3）────────────────────────────
//
// 此前只按 direction 分支，进项一律挂 222102，普票被当专票做了进项抵扣 → 少缴税。

const INPUT_TAX_ACCOUNT = "222102";
const OUTPUT_TAX_ACCOUNT = "222101";
const COST_ACCOUNT = "6301e07";

function findLine(draft: ReturnType<typeof buildInvoiceVoucherDraft>, code: string) {
  return draft.lines.find((l) => l.accountCode === code);
}

/** 四种规范发票类型 × 进项/销项，逐个断言凭证结构。 */
const INVOICE_TYPE_CASES = [
  { invoiceType: "vat_special", label: "增值税专用发票", deductible: true },
  { invoiceType: "vat_general", label: "增值税普通发票", deductible: false },
  { invoiceType: "electronic", label: "电子发票", deductible: false },
  { invoiceType: "receipt", label: "收据", deductible: false },
] as const;

for (const { invoiceType, label, deductible } of INVOICE_TYPE_CASES) {
  test(`进项-${label}（${invoiceType}）：进项税${deductible ? "可" : "不可"}抵扣`, () => {
    const d = buildInvoiceVoucherDraft({ ...INPUT, invoiceType });

    assert.ok(isVoucherBalanced(d), "无论可否抵扣都必须借贷平衡");
    assert.equal(Number(findLine(d, "2202")!.credit), 1130, "贷方应付账款恒为价税合计");

    const taxLine = findLine(d, INPUT_TAX_ACCOUNT);
    const costLine = findLine(d, COST_ACCOUNT)!;

    if (deductible) {
      assert.ok(taxLine, "专票必须有 222102 进项税额行");
      assert.equal(Number(taxLine!.debit), 130);
      assert.equal(Number(costLine.debit), 1000, "可抵扣时成本只含不含税金额");
    } else {
      assert.equal(taxLine, undefined, `${label}不得挂 222102 进项税额——这正是少缴税的成因`);
      assert.equal(Number(costLine.debit), 1130, "不可抵扣时税额并入成本费用（价税合计）");
      assert.match(costLine.summary, /不可抵扣/, "摘要需说明税额已并入成本，便于复核");
    }
  });

  test(`销项-${label}（${invoiceType}）：销项税与发票类型无关`, () => {
    const d = buildInvoiceVoucherDraft({ ...OUTPUT, invoiceType });

    assert.ok(isVoucherBalanced(d));
    // 普票同样产生销项税义务，不能因为「不是专票」就不计销项。
    const taxLine = findLine(d, OUTPUT_TAX_ACCOUNT);
    assert.ok(taxLine, "有税额的销项发票一律计 222101 销项税额");
    assert.equal(Number(taxLine!.debit) === 0 && Number(taxLine!.credit), 260);
    assert.equal(Number(findLine(d, "1122")!.debit), 2260);
    assert.equal(Number(findLine(d, "6001")!.credit), 2000);
    assert.equal(findLine(d, INPUT_TAX_ACCOUNT), undefined, "销项凭证不得出现进项税科目");
  });
}

test("进项-收据无税额时：两行凭证，金额即价税合计", () => {
  const d = buildInvoiceVoucherDraft({ ...INPUT, invoiceType: "receipt", taxAmount: 0, totalAmount: 1000 });
  assert.equal(d.lines.length, 2);
  assert.ok(isVoucherBalanced(d));
  assert.equal(Number(findLine(d, COST_ACCOUNT)!.debit), 1000);
  // 没有税额时不该出现「含不可抵扣进项税」的误导性摘要。
  assert.doesNotMatch(findLine(d, COST_ACCOUNT)!.summary, /不可抵扣/);
});

test("进项-发票类型缺失或无法识别时保守按不可抵扣处理", () => {
  for (const invoiceType of [undefined, null, "", "  ", "未知类型", "vat_speciall"]) {
    const d = buildInvoiceVoucherDraft({ ...INPUT, invoiceType });
    assert.equal(
      findLine(d, INPUT_TAX_ACCOUNT), undefined,
      `invoiceType=${JSON.stringify(invoiceType)} 不得走抵扣分支：判错成可抵扣是少缴税（税务违规），判错成不可抵扣只是多缴税`
    );
    assert.equal(Number(findLine(d, COST_ACCOUNT)!.debit), 1130);
    assert.ok(isVoucherBalanced(d));
  }
});

test("进项-存量别名 vat_common 等价于 vat_general（不可抵扣）", () => {
  // 025 演示数据里的拼法。DB CHECK 迁移落地之前，这些行也必须被判成不可抵扣，
  // 否则修复要等迁移才生效，中间这段时间照旧错账。
  const d = buildInvoiceVoucherDraft({ ...INPUT, invoiceType: "vat_common" });
  assert.equal(findLine(d, INPUT_TAX_ACCOUNT), undefined);
  assert.equal(Number(findLine(d, COST_ACCOUNT)!.debit), 1130);
});

test("进项-发票类型大小写与空白不影响判定", () => {
  const d = buildInvoiceVoucherDraft({ ...INPUT, invoiceType: "  VAT_SPECIAL  " });
  assert.equal(Number(findLine(d, INPUT_TAX_ACCOUNT)!.debit), 130);
  assert.equal(Number(findLine(d, COST_ACCOUNT)!.debit), 1000);
});

test("全部发票类型 × 进销项组合一律借贷平衡", () => {
  for (const { invoiceType } of INVOICE_TYPE_CASES) {
    for (const base of [INPUT, OUTPUT]) {
      for (const taxAmount of [0, 130, 260.01]) {
        const d = buildInvoiceVoucherDraft({
          ...base, invoiceType, taxAmount, totalAmount: base.amount + taxAmount
        });
        assert.ok(isVoucherBalanced(d), `${base.direction}/${invoiceType}/tax=${taxAmount} 不平衡`);
      }
    }
  }
});
