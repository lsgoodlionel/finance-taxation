/**
 * 付款凭证与银行导出的测试（V13-C4/C6）。
 *
 * 付款的贷方永远是银行存款，借方取决于付的是什么——写反会让负债越付越多。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_PAYABLE_ACCOUNT,
  EMPLOYEE_PAYABLE_ACCOUNT,
  buildBankExportRows,
  buildPaymentLines,
  toBankCsv,
  type PaymentTarget
} from "./voucher.js";

const NAMES = new Map([
  ["1002", "银行存款"],
  [EMPLOYEE_PAYABLE_ACCOUNT, "其他应付款"],
  [CONTRACT_PAYABLE_ACCOUNT, "应付账款"]
]);

const REIMBURSEMENT_TARGET: PaymentTarget = {
  kind: "reimbursement",
  label: "RMB-202609-0001",
  counterpartyId: "cp-emp-1"
};

const CONTRACT_TARGET: PaymentTarget = {
  kind: "schedule",
  label: "HT-2026-001 第 2 期",
  counterpartyId: "cp-vendor-1"
};

test("付报销：借其他应付款、贷银行存款", () => {
  const lines = buildPaymentLines(
    { amountCents: 100000, bankAccountCode: "1002", target: REIMBURSEMENT_TARGET },
    NAMES
  );

  const debit = lines.find((line) => line.debitCents > 0);
  const credit = lines.find((line) => line.creditCents > 0);

  assert.equal(debit?.accountCode, EMPLOYEE_PAYABLE_ACCOUNT);
  assert.equal(credit?.accountCode, "1002");
});

test("付合同款：借应付账款、贷银行存款", () => {
  const lines = buildPaymentLines(
    { amountCents: 500000, bankAccountCode: "1002", target: CONTRACT_TARGET },
    NAMES
  );

  assert.equal(lines.find((line) => line.debitCents > 0)?.accountCode, CONTRACT_PAYABLE_ACCOUNT);
});

test("借贷平衡", () => {
  const lines = buildPaymentLines(
    { amountCents: 123456, bankAccountCode: "1002", target: CONTRACT_TARGET },
    NAMES
  );

  const debit = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditCents, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 123456);
});

test("借方带往来单位，贷方不带", () => {
  // 银行存款不是往来科目，挂上往来单位会让账龄表把银行账户当成欠款对象。
  const lines = buildPaymentLines(
    { amountCents: 100000, bankAccountCode: "1002", target: CONTRACT_TARGET },
    NAMES
  );

  assert.equal(lines.find((line) => line.debitCents > 0)?.counterpartyId, "cp-vendor-1");
  assert.equal(lines.find((line) => line.creditCents > 0)?.counterpartyId, null);
});

test("付款账户可以不是 1002", () => {
  // 多个银行账户的公司要能指定从哪个户付。
  const lines = buildPaymentLines(
    { amountCents: 100000, bankAccountCode: "100201", target: CONTRACT_TARGET },
    NAMES
  );

  assert.equal(lines.find((line) => line.creditCents > 0)?.accountCode, "100201");
});

test("取不到科目名时用编码兜底", () => {
  const lines = buildPaymentLines(
    { amountCents: 100000, bankAccountCode: "1002", target: CONTRACT_TARGET },
    new Map()
  );

  assert.equal(lines.find((line) => line.debitCents > 0)?.accountName, CONTRACT_PAYABLE_ACCOUNT);
});

test("摘要带上付款对象，凭证上看得出在付什么", () => {
  const lines = buildPaymentLines(
    { amountCents: 100000, bankAccountCode: "1002", target: CONTRACT_TARGET },
    NAMES
  );

  assert.match(lines[0]!.summary, /HT-2026-001/);
});

// ── 银行导出（C6）──────────────────────────────────────────────────

const EXPORT_INPUT = [
  {
    paymentNo: "PAY-202609-0001",
    payeeName: "某某供应商",
    payeeAccount: "6222021234567890",
    payeeBank: "工商银行深圳分行",
    amountCents: 500000,
    note: "HT-2026-001 第 2 期"
  },
  {
    paymentNo: "PAY-202609-0002",
    payeeName: "张三",
    payeeAccount: "6222029876543210",
    payeeBank: "招商银行",
    amountCents: 84250,
    note: "RMB-202609-0003 报销款"
  }
];

test("导出行的金额是元、两位小数", () => {
  // 银行导入模板收的是元。分传过去会变成一百倍的付款——
  // 这是这个功能最贵的一种错法。
  const rows = buildBankExportRows(EXPORT_INPUT);

  assert.equal(rows[0]!.amount, "5000.00");
  assert.equal(rows[1]!.amount, "842.50");
});

test("CSV 带表头，字段顺序固定", () => {
  const csv = toBankCsv(buildBankExportRows(EXPORT_INPUT));
  const [header] = csv.split("\n");

  assert.match(header!, /收款人名称/);
  assert.match(header!, /收款账号/);
  assert.match(header!, /金额/);
});

test("CSV 转义含逗号与引号的字段", () => {
  // 收款人名称里带逗号会把一列拆成两列，整行错位——而错位的那一行
  // 在银行侧表现为「账号格式不对」，很难联想到是导出的问题。
  const csv = toBankCsv(
    buildBankExportRows([
      {
        paymentNo: "P1",
        payeeName: '某某公司,深圳分部',
        payeeAccount: "622202",
        payeeBank: '招商银行"福田"支行',
        amountCents: 100,
        note: ""
      }
    ])
  );

  assert.match(csv, /"某某公司,深圳分部"/);
  assert.match(csv, /"招商银行""福田""支行"/);
});

test("CSV 的账号按文本导出，不被表格软件转成科学计数", () => {
  // 16 位卡号在 Excel 里会变成 6.22202E+15，粘回银行系统就是废的。
  // 这是导出对账最常见的现场事故。
  const csv = toBankCsv(buildBankExportRows(EXPORT_INPUT));

  assert.match(csv, /"6222021234567890"/);
});

test("空列表导出仍有表头", () => {
  // 只有表头的文件让用户一眼看出「没有待付款项」，而空文件像是导出失败。
  const csv = toBankCsv(buildBankExportRows([]));

  assert.match(csv, /收款人名称/);
  assert.equal(csv.split("\n").length, 1);
});
