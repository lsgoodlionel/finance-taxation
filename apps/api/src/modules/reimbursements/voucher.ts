/**
 * 报销单的凭证生成（V13-B4/B6/B7）。
 *
 * ## 贷方挂哪里取决于有没有借款
 *
 * ```
 * 无借款：借 费用科目 xxx / 贷 2241 其他应付款（欠员工的，付款时再冲）
 * 有借款：借 费用科目 xxx / 贷 1221 其他应收款（从预支的那笔里扣）
 * ```
 *
 * **多退少补不写成分支**：有借款时一律贷 1221，剩下的由余额的符号自然体现——
 * 借 5000 报 4200 后 1221 还剩 800（员工要退），借 5000 报 5600 后 1221 变成
 * -600（公司要补）。写成 if/else 判断该退还是该补，迟早有一边写反。
 *
 * ## 分摊展开成多行
 *
 * 一行费用分给两个部门，就变成两条借方分录，各带各的成本中心。
 * 金额用分摊结果（已经末项扫尾过），不在这里重算——重算会与写进
 * `reimbursement_allocations` 的数字不一致。
 *
 * ## 凭证一律 draft
 *
 * 与折旧、红冲、借款付款一致。
 */

import { randomUUID } from "node:crypto";
import { withTransaction } from "../../db/client.js";
import { fromCents } from "../../utils/money.js";
import type { ReimbursementRow } from "./store.js";

/** 欠员工的报销款挂这里。`account_type` 是 `liability_payable`（迁移 071 补的）。 */
export const EMPLOYEE_PAYABLE_ACCOUNT = "2241";
/** 备用金科目，与 advances 模块同一个。 */
export const ADVANCE_ACCOUNT = "1221";

export interface BuildVoucherLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  costCenterId: string | null;
  counterpartyId: string | null;
  summary: string;
}

/**
 * 把报销单摊成凭证分录（纯函数，不查库）。
 *
 * 分开成纯函数是为了能脱库测试借贷平衡与分摊展开——那两件事错了不会报错，
 * 只会生成一张过不了账的凭证，而错误信息会指向过账流程而不是这里。
 */
export function buildReimbursementLines(
  reimbursement: ReimbursementRow,
  accountNames: ReadonlyMap<string, string>
): BuildVoucherLine[] {
  const lines: BuildVoucherLine[] = [];

  for (const line of reimbursement.lines) {
    const name = accountNames.get(line.accountCode) ?? line.accountCode;
    const summary = line.summary || `${reimbursement.reimbursementNo} ${line.expenseType}`;

    if (line.allocations.length === 0) {
      // 不分摊：整行一条分录，成本中心留空（落进部门报表的「未指定」）。
      lines.push({
        accountCode: line.accountCode,
        accountName: name,
        debitCents: line.amountCents,
        creditCents: 0,
        costCenterId: null,
        counterpartyId: null,
        summary
      });
      continue;
    }

    for (const allocation of line.allocations) {
      // 金额直接用分摊结果，**不在这里按比例重算**——重算会与写进
      // reimbursement_allocations 的数字不一致（末项扫尾的那一分）。
      lines.push({
        accountCode: line.accountCode,
        accountName: name,
        debitCents: allocation.amountCents,
        creditCents: 0,
        costCenterId: allocation.costCenterId,
        counterpartyId: null,
        summary
      });
    }
  }

  // 贷方一条：有借款冲 1221，否则挂应付员工。两者都是往来科目，
  // 带上往来单位才能按人分户。
  const creditAccount = reimbursement.advanceId ? ADVANCE_ACCOUNT : EMPLOYEE_PAYABLE_ACCOUNT;
  lines.push({
    accountCode: creditAccount,
    accountName: accountNames.get(creditAccount) ?? creditAccount,
    debitCents: 0,
    creditCents: reimbursement.totalCents,
    costCenterId: null,
    counterpartyId: reimbursement.counterpartyId,
    summary: reimbursement.advanceId
      ? `${reimbursement.reimbursementNo} 冲抵备用金`
      : `${reimbursement.reimbursementNo} 应付报销款`
  });

  return lines;
}

/**
 * 生成报销凭证草稿。
 *
 * 幂等：已经有凭证的报销单直接返回那一张。审批接口重试时不能生成第二张——
 * 两张一模一样的费用凭证过账后，费用与负债都会翻倍。
 */
export async function createReimbursementVoucher(
  reimbursement: ReimbursementRow
): Promise<{ voucherId: string; status: "draft" }> {
  if (reimbursement.voucherId) {
    return { voucherId: reimbursement.voucherId, status: "draft" };
  }

  const voucherId = `vch-rmb-${randomUUID()}`;
  const summary = `${reimbursement.reimbursementNo} 费用报销`;

  await withTransaction(async (tx) => {
    const codes = [
      ...new Set([
        ...reimbursement.lines.map((line) => line.accountCode),
        reimbursement.advanceId ? ADVANCE_ACCOUNT : EMPLOYEE_PAYABLE_ACCOUNT
      ])
    ];
    const accounts = await tx.query<{ code: string; name: string }>(
      `select code, name from accounts where company_id = $1 and code = any($2::text[])`,
      [reimbursement.companyId, codes]
    );
    const nameOf = new Map(accounts.rows.map((row) => [row.code, row.name]));

    await tx.query(
      `insert into vouchers
         (id, company_id, voucher_type, summary, status, source, accounting_date, period)
       values ($1, $2, 'payment', $3, 'draft', 'manual', $4::date, $5)`,
      [
        voucherId,
        reimbursement.companyId,
        summary,
        reimbursement.expenseDate,
        reimbursement.expenseDate.slice(0, 7)
      ]
    );

    const built = buildReimbursementLines(reimbursement, nameOf);
    for (const [index, line] of built.entries()) {
      await tx.query(
        `insert into voucher_lines
           (id, company_id, voucher_id, sort_order, summary, account_code, account_name,
            debit, credit, counterparty_id, cost_center_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          `vl-${randomUUID()}`,
          reimbursement.companyId,
          voucherId,
          index,
          line.summary,
          line.accountCode,
          line.accountName,
          fromCents(line.debitCents),
          fromCents(line.creditCents),
          line.counterpartyId,
          line.costCenterId
        ]
      );
    }

    await tx.query(
      `update reimbursements set voucher_id = $3, updated_at = now()
        where company_id = $1 and id = $2`,
      [reimbursement.companyId, reimbursement.id, voucherId]
    );
  });

  return { voucherId, status: "draft" };
}
