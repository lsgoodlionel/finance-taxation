/**
 * 报销凭证生成的测试（V13-B4/B6/B7）。
 *
 * 借贷平衡与分摊展开错了不会报错，只会生成一张过不了账的凭证——而那时的
 * 错误信息指向过账流程，不指向这里。所以脱库测这一层。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVANCE_ACCOUNT,
  EMPLOYEE_PAYABLE_ACCOUNT,
  buildReimbursementLines
} from "./voucher.js";
import type { ReimbursementRow } from "./store.js";

const NAMES = new Map([
  ["660203", "管理费用-差旅费"],
  ["660204", "管理费用-业务招待费"],
  [ADVANCE_ACCOUNT, "其他应收款"],
  [EMPLOYEE_PAYABLE_ACCOUNT, "其他应付款"]
]);

function makeReimbursement(overrides: Partial<ReimbursementRow> = {}): ReimbursementRow {
  const lines = overrides.lines ?? [
    {
      id: "l1",
      expenseType: "travel_hotel",
      accountCode: "660203",
      amountCents: 100000,
      quantity: 2,
      invoiceId: null,
      summary: "住宿",
      allocations: []
    }
  ];
  return {
    id: "r1",
    companyId: "c1",
    reimbursementNo: "RMB-202609-0001",
    requestId: null,
    advanceId: null,
    applicantUserId: "u1",
    counterpartyId: "cp-emp-1",
    expenseDate: "2026-09-15",
    status: "approved",
    voucherId: null,
    note: null,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    ...overrides
  };
}

function sumDebit(lines: ReturnType<typeof buildReimbursementLines>): number {
  return lines.reduce((sum, line) => sum + line.debitCents, 0);
}
function sumCredit(lines: ReturnType<typeof buildReimbursementLines>): number {
  return lines.reduce((sum, line) => sum + line.creditCents, 0);
}

test("无借款时贷方挂应付员工", () => {
  const lines = buildReimbursementLines(makeReimbursement(), NAMES);

  const credit = lines.find((line) => line.creditCents > 0);
  assert.equal(credit?.accountCode, EMPLOYEE_PAYABLE_ACCOUNT);
  assert.equal(credit?.counterpartyId, "cp-emp-1", "往来科目必须带往来单位，否则无法按人分户");
});

test("有借款时贷方冲备用金", () => {
  const lines = buildReimbursementLines(makeReimbursement({ advanceId: "adv-1" }), NAMES);

  const credit = lines.find((line) => line.creditCents > 0);
  assert.equal(credit?.accountCode, ADVANCE_ACCOUNT);
});

test("借贷平衡", () => {
  const lines = buildReimbursementLines(makeReimbursement(), NAMES);

  assert.equal(sumDebit(lines), sumCredit(lines));
  assert.equal(sumDebit(lines), 100000);
});

test("分摊展开成多条借方分录，各带各的成本中心", () => {
  const reimbursement = makeReimbursement({
    lines: [
      {
        id: "l1",
        expenseType: "entertainment",
        accountCode: "660204",
        amountCents: 100000,
        quantity: 1,
        invoiceId: null,
        summary: "招待",
        allocations: [
          { costCenterId: "cc-rnd", ratioBp: 6000, amountCents: 60000 },
          { costCenterId: "cc-sales", ratioBp: 4000, amountCents: 40000 }
        ]
      }
    ]
  });

  const lines = buildReimbursementLines(reimbursement, NAMES);
  const debits = lines.filter((line) => line.debitCents > 0);

  assert.equal(debits.length, 2);
  assert.deepEqual(
    debits.map((line) => line.costCenterId).sort(),
    ["cc-rnd", "cc-sales"]
  );
  assert.equal(sumDebit(lines), sumCredit(lines), "分摊后仍须借贷平衡");
});

test("分摊金额直接取用，不按比例重算", () => {
  // 末项扫尾的那一分：60000/40000 对应 6000/4000 基点没有问题，但
  // 33/33/34 这种就有——重算会得到与写进 reimbursement_allocations
  // 不一样的数字，凭证与分摊表从此对不上。
  const reimbursement = makeReimbursement({
    lines: [
      {
        id: "l1",
        expenseType: "office",
        accountCode: "660203",
        amountCents: 100,
        quantity: 1,
        invoiceId: null,
        summary: "杂费",
        allocations: [
          { costCenterId: "a", ratioBp: 3333, amountCents: 33 },
          { costCenterId: "b", ratioBp: 3333, amountCents: 33 },
          { costCenterId: "c", ratioBp: 3334, amountCents: 34 }
        ]
      }
    ]
  });

  const lines = buildReimbursementLines(reimbursement, NAMES);
  const debits = lines.filter((line) => line.debitCents > 0);

  assert.deepEqual(debits.map((line) => line.debitCents), [33, 33, 34]);
  assert.equal(sumDebit(lines), 100);
  assert.equal(sumCredit(lines), 100);
});

test("多行费用各自分摊，合计仍平", () => {
  const reimbursement = makeReimbursement({
    lines: [
      {
        id: "l1",
        expenseType: "travel_hotel",
        accountCode: "660203",
        amountCents: 70000,
        quantity: 2,
        invoiceId: null,
        summary: "住宿",
        // 住宿全归研发部
        allocations: [{ costCenterId: "cc-rnd", ratioBp: 10000, amountCents: 70000 }]
      },
      {
        id: "l2",
        expenseType: "entertainment",
        accountCode: "660204",
        amountCents: 30000,
        quantity: 1,
        invoiceId: null,
        summary: "招待",
        // 招待两个部门对半——这正是「挂单头表达不了」的差别
        allocations: [
          { costCenterId: "cc-rnd", ratioBp: 5000, amountCents: 15000 },
          { costCenterId: "cc-sales", ratioBp: 5000, amountCents: 15000 }
        ]
      }
    ]
  });

  const lines = buildReimbursementLines(reimbursement, NAMES);

  assert.equal(lines.filter((line) => line.debitCents > 0).length, 3);
  assert.equal(sumDebit(lines), 100000);
  assert.equal(sumCredit(lines), 100000);
});

test("不分摊的行成本中心留空，不编一个出来", () => {
  // 落进部门费用报表的「未指定」一行，与 V12-D1 的处理一致：
  // 不丢弃也不摊派。
  const lines = buildReimbursementLines(makeReimbursement(), NAMES);
  const debit = lines.find((line) => line.debitCents > 0);

  assert.equal(debit?.costCenterId, null);
});

test("费用科目不带往来单位", () => {
  // 挂上往来单位会让账龄表把费用科目当成一个欠款对象。
  const lines = buildReimbursementLines(makeReimbursement(), NAMES);

  for (const line of lines.filter((item) => item.debitCents > 0)) {
    assert.equal(line.counterpartyId, null);
  }
});

test("取不到科目名时用编码兜底，不写空串", () => {
  // 空的科目名会让凭证打印出来缺一列，而缺失是静默的。
  const lines = buildReimbursementLines(makeReimbursement(), new Map());
  const debit = lines.find((line) => line.debitCents > 0);

  assert.equal(debit?.accountName, "660203");
});
