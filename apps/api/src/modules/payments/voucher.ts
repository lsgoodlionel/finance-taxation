/**
 * 付款凭证与银行指令导出（V13-C4/C6）。
 *
 * ## 凭证方向
 *
 * ```
 * 付报销款：借 2241 其他应付款（欠员工的）  / 贷 1002 银行存款
 * 付合同款：借 2202 应付账款（欠供应商的）  / 贷 1002 银行存款
 * ```
 *
 * 两者都是**负债减少**。写反会让负债越付越多——而那种错在余额表上要到
 * 月末才看得出来。
 *
 * 借款付款不在这里：它是资产内部转移（借 1221 其他应收款），方向不同，
 * 走 `advances/payment.ts`。
 *
 * ## 银企直连不做
 *
 * 只导出银行可导入的 CSV。理由见迁移 088 的文件头与蓝图第五节。
 */

import { fromCents } from "../../utils/money.js";

/** 欠员工的报销款。`account_type` 是 `liability_payable`（迁移 071 补的）。 */
export const EMPLOYEE_PAYABLE_ACCOUNT = "2241";
/** 欠供应商的合同款。 */
export const CONTRACT_PAYABLE_ACCOUNT = "2202";

export interface PaymentTarget {
  kind: "reimbursement" | "schedule";
  /** 展示用标识（单据号 / 合同号+期次），写进凭证摘要。 */
  label: string;
  /** 收款方对应的往来单位。 */
  counterpartyId: string;
}

export interface PaymentVoucherInput {
  amountCents: number;
  bankAccountCode: string;
  target: PaymentTarget;
}

export interface PaymentVoucherLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  counterpartyId: string | null;
  summary: string;
}

export function buildPaymentLines(
  input: PaymentVoucherInput,
  accountNames: ReadonlyMap<string, string>
): PaymentVoucherLine[] {
  const debitAccount =
    input.target.kind === "reimbursement" ? EMPLOYEE_PAYABLE_ACCOUNT : CONTRACT_PAYABLE_ACCOUNT;
  const summary = `${input.target.label} 付款`;

  return [
    {
      accountCode: debitAccount,
      accountName: accountNames.get(debitAccount) ?? debitAccount,
      debitCents: input.amountCents,
      creditCents: 0,
      // 借方是往来科目，带往来单位才能按户核销。
      counterpartyId: input.target.counterpartyId,
      summary
    },
    {
      accountCode: input.bankAccountCode,
      accountName: accountNames.get(input.bankAccountCode) ?? input.bankAccountCode,
      debitCents: 0,
      creditCents: input.amountCents,
      // 银行存款不是往来科目——挂上往来单位会让账龄表把银行账户当成欠款对象。
      counterpartyId: null,
      summary
    }
  ];
}

export interface BankExportInput {
  paymentNo: string;
  payeeName: string;
  payeeAccount: string;
  payeeBank: string;
  amountCents: number;
  note: string;
}

export interface BankExportRow {
  paymentNo: string;
  payeeName: string;
  payeeAccount: string;
  payeeBank: string;
  /** **元**，两位小数。银行导入模板收的是元，传分会变成一百倍的付款。 */
  amount: string;
  note: string;
}

export function buildBankExportRows(inputs: readonly BankExportInput[]): BankExportRow[] {
  return inputs.map((input) => ({
    paymentNo: input.paymentNo,
    payeeName: input.payeeName,
    payeeAccount: input.payeeAccount,
    payeeBank: input.payeeBank,
    amount: fromCents(input.amountCents),
    note: input.note
  }));
}

const CSV_HEADERS = ["付款单号", "收款人名称", "收款账号", "收款银行", "金额", "用途"] as const;

/**
 * CSV 字段转义。
 *
 * 收款人名称里带逗号会把一列拆成两列、整行错位，而错位在银行侧表现为
 * 「账号格式不对」，很难联想到是导出的问题。
 */
function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * 导出成银行可导入的 CSV。
 *
 * **所有字段一律加引号**，不只是含特殊字符的：银行卡号是 16-19 位数字，
 * 不加引号会被 Excel 转成科学计数（6.22202E+15），粘回银行系统就是废的。
 * 这是导出对账最常见的现场事故。
 *
 * 空列表也输出表头——只有表头的文件让用户一眼看出「没有待付款项」，
 * 而空文件像是导出失败。
 */
export function toBankCsv(rows: readonly BankExportRow[]): string {
  const lines = [CSV_HEADERS.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(
      [row.paymentNo, row.payeeName, row.payeeAccount, row.payeeBank, row.amount, row.note]
        .map(escapeCsv)
        .join(",")
    );
  }
  return lines.join("\n");
}
