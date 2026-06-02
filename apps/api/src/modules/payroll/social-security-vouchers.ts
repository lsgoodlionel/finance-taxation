/**
 * P4 三险一金凭证自动化
 *
 * 工资关账后，按期聚合社保/公积金，自动生成两张记账凭证草稿：
 *   1. 计提（accrual）：单位承担部分计入管理费用，确认应付职工薪酬
 *   2. 缴纳（payment）：单位+个人合计，从应付职工薪酬转出，贷银行存款
 *
 * 纯函数，便于单测；不触碰数据库。
 */

export interface SocialSecuritySummary {
  period: string;
  socialSecurityEmployer: number; // 社保单位部分
  socialSecurityEmployee: number; // 社保个人部分（工资中代扣）
  housingFundEmployer: number;    // 公积金单位部分
  housingFundEmployee: number;    // 公积金个人部分（工资中代扣）
}

export interface VoucherDraftLineInput {
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface SocialSecurityVoucherDraft {
  key: "social_security_accrual" | "social_security_payment";
  voucherType: "accrual" | "payment";
  summary: string;
  lines: VoucherDraftLineInput[];
}

const ACCOUNTS = {
  expense:      { code: "6602", name: "管理费用" },
  payable:      { code: "2211", name: "应付职工薪酬" },
  bank:         { code: "1002", name: "银行存款" },
} as const;

function fmt(n: number): string {
  return n.toFixed(2);
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function line(
  summary: string,
  account: { code: string; name: string },
  debit: number,
  credit: number,
): VoucherDraftLineInput {
  return {
    summary,
    accountCode: account.code,
    accountName: account.name,
    debit: fmt(debit),
    credit: fmt(credit),
  };
}

/**
 * 生成三险一金「计提 + 缴纳」两张凭证草稿。
 * 若单位与个人部分均为 0，则返回空数组（无需生成）。
 */
export function buildSocialSecurityVouchers(
  summary: SocialSecuritySummary,
): SocialSecurityVoucherDraft[] {
  const ssEmployer = round2(summary.socialSecurityEmployer);
  const ssEmployee = round2(summary.socialSecurityEmployee);
  const hfEmployer = round2(summary.housingFundEmployer);
  const hfEmployee = round2(summary.housingFundEmployee);

  const accrualTotal = round2(ssEmployer + hfEmployer);
  const paymentTotal = round2(ssEmployer + ssEmployee + hfEmployer + hfEmployee);

  if (paymentTotal <= 0) return [];

  const drafts: SocialSecurityVoucherDraft[] = [];

  // 1. 计提：单位部分计入费用
  if (accrualTotal > 0) {
    const lines: VoucherDraftLineInput[] = [];
    if (ssEmployer > 0) lines.push(line(`${summary.period} 计提社保（单位）`, ACCOUNTS.expense, ssEmployer, 0));
    if (hfEmployer > 0) lines.push(line(`${summary.period} 计提公积金（单位）`, ACCOUNTS.expense, hfEmployer, 0));
    if (ssEmployer > 0) lines.push(line(`${summary.period} 应付社保（单位）`, ACCOUNTS.payable, 0, ssEmployer));
    if (hfEmployer > 0) lines.push(line(`${summary.period} 应付公积金（单位）`, ACCOUNTS.payable, 0, hfEmployer));
    drafts.push({
      key: "social_security_accrual",
      voucherType: "accrual",
      summary: `${summary.period} 三险一金计提（单位部分）`,
      lines,
    });
  }

  // 2. 缴纳：单位+个人合计，贷银行存款
  const ssTotal = round2(ssEmployer + ssEmployee);
  const hfTotal = round2(hfEmployer + hfEmployee);
  const paymentLines: VoucherDraftLineInput[] = [];
  if (ssTotal > 0) paymentLines.push(line(`${summary.period} 缴纳社保（单位+个人）`, ACCOUNTS.payable, ssTotal, 0));
  if (hfTotal > 0) paymentLines.push(line(`${summary.period} 缴纳公积金（单位+个人）`, ACCOUNTS.payable, hfTotal, 0));
  paymentLines.push(line(`${summary.period} 三险一金缴款`, ACCOUNTS.bank, 0, paymentTotal));
  drafts.push({
    key: "social_security_payment",
    voucherType: "payment",
    summary: `${summary.period} 三险一金缴纳`,
    lines: paymentLines,
  });

  return drafts;
}

/** 校验一张凭证草稿借贷平衡（用于测试与运行期断言）。 */
export function isBalanced(draft: SocialSecurityVoucherDraft): boolean {
  const debit = draft.lines.reduce((s, l) => s + Number(l.debit), 0);
  const credit = draft.lines.reduce((s, l) => s + Number(l.credit), 0);
  return round2(debit) === round2(credit);
}
