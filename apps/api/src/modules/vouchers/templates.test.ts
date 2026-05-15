import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoucherTemplateDraft,
  listVoucherTemplates
} from "./templates.js";

test("listVoucherTemplates returns the expected built-in keys", () => {
  const templates = listVoucherTemplates();
  assert.deepEqual(
    templates.map((item) => item.key),
    ["sales", "procurement", "expense", "payroll", "asset"]
  );
});

test("buildVoucherTemplateDraft builds balanced sales voucher lines", () => {
  const draft = buildVoucherTemplateDraft({
    templateKey: "sales",
    amount: "1000.00",
    summary: "模板测试销售收入",
    businessEventId: "evt-001",
    companyId: "cmp-tech-001"
  });

  assert.equal(draft.voucherType, "accrual");
  assert.equal(draft.summary, "模板测试销售收入");
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[0]?.accountCode, "1122");
  assert.equal(draft.lines[1]?.accountCode, "6001");

  const debit = draft.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = draft.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(debit.toFixed(2), "1000.00");
  assert.equal(credit.toFixed(2), "1000.00");
});

test("buildVoucherTemplateDraft throws for unknown template keys", () => {
  assert.throws(
    () =>
      buildVoucherTemplateDraft({
        templateKey: "unknown",
        amount: "100.00",
        businessEventId: "evt-001",
        companyId: "cmp-tech-001"
      }),
    /Unknown voucher template/
  );
});
