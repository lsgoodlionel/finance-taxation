/**
 * 付款单的收款方解析（从 `routes.ts` 抽出，V14-A）。
 *
 * ## 为什么抽出来
 *
 * C6 的 CSV 导出和 V14-A 的银企直连指令，收款人取的必须是**同一个人**。
 * 各写一份 SQL 迟早漂移——一边改了取数口径另一边没改，表现是「导出的
 * 文件和直连提交的收款人不一致」，而这种不一致要到银行退回才被发现。
 */

import { query } from "../../db/client.js";

export interface PayeeInfo {
  /** 收款户名。**未必等于往来单位名称**——供应商可能用关联公司账户收款。 */
  payeeName: string;
  payeeAccount: string;
  payeeBank: string;
}

const EMPTY_PAYEE: PayeeInfo = { payeeName: "", payeeAccount: "", payeeBank: "" };

interface PayeeDbRow {
  payment_id: string;
  bank_account_name: string | null;
  bank_account: string | null;
  bank_name: string | null;
  fallback_name: string | null;
}

/**
 * 批量解析付款单的收款方。
 *
 * 返回 Map 而不是数组：调用方按 paymentId 取，缺账户的单据会得到空串
 * 而不是消失——**不因为一条缺账户就让整批取不到**。
 */
export async function resolvePayees(
  companyId: string,
  paymentIds: readonly string[]
): Promise<Map<string, PayeeInfo>> {
  if (paymentIds.length === 0) return new Map();

  const rows = await query<PayeeDbRow>(
    `select p.id as payment_id,
            cp.bank_account_name, cp.bank_account, cp.bank_name,
            coalesce(cp.name, c.counterparty_name) as fallback_name
       from payments p
       left join reimbursements r on r.id = p.reimbursement_id
       left join contract_payment_schedules s on s.id = p.schedule_id
       left join contracts c on c.id = s.contract_id
       left join counterparties cp
              on cp.id = r.counterparty_id
              or (cp.company_id = p.company_id and cp.name = c.counterparty_name)
      where p.company_id = $1 and p.id = any($2::text[])`,
    [companyId, [...paymentIds]]
  );

  return new Map(
    rows.map((row) => [
      row.payment_id,
      {
        // 户名优先取账户户名——收款户名未必等于往来单位名称。没维护则退回
        // 单位名，让出纳一眼看出要补哪个。
        payeeName: row.bank_account_name ?? row.fallback_name ?? "",
        payeeAccount: row.bank_account ?? "",
        payeeBank: row.bank_name ?? ""
      }
    ])
  );
}

/** 单条解析。取不到返回空串三件套，不返回 null——调用方各自兜底会写出四种不同的空值。 */
export async function resolvePayee(companyId: string, paymentId: string): Promise<PayeeInfo> {
  const map = await resolvePayees(companyId, [paymentId]);
  return map.get(paymentId) ?? EMPTY_PAYEE;
}
