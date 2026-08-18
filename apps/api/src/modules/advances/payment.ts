/**
 * 借款付款的凭证生成（V13-B3）。
 *
 * ## 会计处理
 *
 * ```
 * 借：1221 其他应收款-备用金   5000.00   （往来单位 = 借款人）
 *   贷：1002 银行存款                    5000.00
 * ```
 *
 * 借款付出去时钱还没花掉，只是从公司手里转到员工手里，所以是**资产内部转移**
 * 而不是费用。直接记成费用是常见错法：那样员工退回的钱会变成「负费用」，
 * 而且期末挂账的备用金在报表上凭空消失。
 *
 * ## 凭证一律 draft
 *
 * 与折旧、红冲、定期凭证、增值税结转、期末调汇一致——系统生成的凭证都要
 * 会计看一眼再过账。借款付款没有理由破例。
 *
 * 于是这里**只建凭证草稿，不写 ledger_entries**：分录在会计点「过账」时才由
 * 凭证过账流程统一写入（那条路径已经带着借贷平衡校验、会计期间校验与审计
 * 留痕）。绕过它自己写分录等于把那三样保证也绕过去了。
 */

import { randomUUID } from "node:crypto";
import { withTransaction } from "../../db/client.js";
import { fromCents } from "../../utils/money.js";
import type { AdvanceRow } from "./store.js";
import { ADVANCE_ACCOUNT_CODE } from "./store.js";

export interface PayAdvanceInput {
  advance: AdvanceRow;
  /** 付款日，也是凭证的会计日期。 */
  paidOn: string;
  /** 付款银行账户对应的科目，默认 1002 银行存款。 */
  bankAccountCode?: string;
  createdByUserId: string;
}

export interface PayAdvanceOutcome {
  voucherId: string;
  /** 凭证状态恒为 draft，写出来是为了调用方不必猜。 */
  status: "draft";
}

const DEFAULT_BANK_ACCOUNT = "1002";

/**
 * 生成借款付款的凭证草稿，并把借款单标记为已付款。
 *
 * 幂等：已经有付款凭证的借款单直接返回那一张。付款接口被重试时不能生成
 * 第二张凭证——两张一模一样的付款凭证过账后，账上会认为公司借出了两倍的钱。
 */
export async function payAdvance(input: PayAdvanceInput): Promise<PayAdvanceOutcome> {
  const { advance } = input;
  if (advance.paymentVoucherId) {
    return { voucherId: advance.paymentVoucherId, status: "draft" };
  }

  const bankCode = input.bankAccountCode ?? DEFAULT_BANK_ACCOUNT;
  const voucherId = `vch-adv-${randomUUID()}`;
  const amount = fromCents(advance.amountCents);
  const summary = `${advance.advanceNo} 备用金借出`;

  await withTransaction(async (tx) => {
    const accounts = await tx.query<{ code: string; name: string }>(
      `select code, name from accounts where company_id = $1 and code = any($2::text[])`,
      [advance.companyId, [ADVANCE_ACCOUNT_CODE, bankCode]]
    );
    const nameOf = new Map(accounts.rows.map((row) => [row.code, row.name]));

    await tx.query(
      `insert into vouchers
         (id, company_id, voucher_type, summary, status, source, accounting_date, period)
       values ($1, $2, 'payment', $3, 'draft', 'manual', $4::date, $5)`,
      [voucherId, advance.companyId, summary, input.paidOn, input.paidOn.slice(0, 7)]
    );

    // 借方带往来单位，贷方不带——银行存款不是往来科目，挂上往来单位会让
    // 账龄表把银行账户当成一个欠款对象。
    await tx.query(
      `insert into voucher_lines
         (id, company_id, voucher_id, sort_order, summary, account_code, account_name,
          debit, credit, counterparty_id)
       values ($1, $11, $2, 1, $3, $4, $5, $6, 0, $7),
              ($8, $11, $2, 2, $3, $9, $10, 0, $6, null)`,
      [
        `vl-${randomUUID()}`,
        voucherId,
        summary,
        ADVANCE_ACCOUNT_CODE,
        nameOf.get(ADVANCE_ACCOUNT_CODE) ?? "其他应收款",
        amount,
        advance.counterpartyId,
        `vl-${randomUUID()}`,
        bankCode,
        nameOf.get(bankCode) ?? "银行存款",
        advance.companyId
      ]
    );

    await tx.query(
      `update advances set status = 'paid', payment_voucher_id = $3, updated_at = now()
        where company_id = $1 and id = $2`,
      [advance.companyId, advance.id, voucherId]
    );
  });

  return { voucherId, status: "draft" };
}
