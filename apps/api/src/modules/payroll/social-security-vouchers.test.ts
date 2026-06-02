import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSocialSecurityVouchers,
  isBalanced,
  type SocialSecuritySummary,
} from "./social-security-vouchers.js";

const SUMMARY: SocialSecuritySummary = {
  period: "2026-05",
  socialSecurityEmployer: 3200,
  socialSecurityEmployee: 1600,
  housingFundEmployer: 1200,
  housingFundEmployee: 1200,
};

test("生成计提与缴纳两张凭证", () => {
  const drafts = buildSocialSecurityVouchers(SUMMARY);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.key, "social_security_accrual");
  assert.equal(drafts[1]?.key, "social_security_payment");
});

test("两张凭证均借贷平衡", () => {
  for (const draft of buildSocialSecurityVouchers(SUMMARY)) {
    assert.ok(isBalanced(draft), `凭证 ${draft.key} 应借贷平衡`);
  }
});

test("计提凭证仅含单位部分，金额正确", () => {
  const [accrual] = buildSocialSecurityVouchers(SUMMARY);
  const totalDebit = accrual!.lines.reduce((s, l) => s + Number(l.debit), 0);
  // 单位社保 3200 + 单位公积金 1200 = 4400
  assert.equal(totalDebit, 4400);
});

test("缴纳凭证贷银行存款为单位+个人合计", () => {
  const drafts = buildSocialSecurityVouchers(SUMMARY);
  const payment = drafts.find((d) => d.key === "social_security_payment")!;
  const bankLine = payment.lines.find((l) => l.accountCode === "1002")!;
  // 3200+1600+1200+1200 = 7200
  assert.equal(Number(bankLine.credit), 7200);
});

test("全为 0 时不生成凭证", () => {
  const drafts = buildSocialSecurityVouchers({
    period: "2026-05",
    socialSecurityEmployer: 0, socialSecurityEmployee: 0,
    housingFundEmployer: 0, housingFundEmployee: 0,
  });
  assert.equal(drafts.length, 0);
});

test("仅有个人部分（无单位）时只生成缴纳凭证", () => {
  const drafts = buildSocialSecurityVouchers({
    period: "2026-05",
    socialSecurityEmployer: 0, socialSecurityEmployee: 800,
    housingFundEmployer: 0, housingFundEmployee: 600,
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.key, "social_security_payment");
  assert.ok(isBalanced(drafts[0]!));
});

test("金额含小数时仍保持平衡", () => {
  const drafts = buildSocialSecurityVouchers({
    period: "2026-05",
    socialSecurityEmployer: 3200.33, socialSecurityEmployee: 1600.67,
    housingFundEmployer: 1200.5, housingFundEmployee: 1200.5,
  });
  for (const draft of drafts) {
    assert.ok(isBalanced(draft), `凭证 ${draft.key} 含小数应平衡`);
  }
});
