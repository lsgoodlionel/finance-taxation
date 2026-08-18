/**
 * 报销审核的取数与执行（V13-D）。
 *
 * 判断全在 `audit.ts`（纯函数），这里负责把四类校验需要的数据凑齐：
 * 公司抬头、发票明细、已被占用的发票、适用的费用标准、申请人职级。
 *
 * 分开的收益：同一套判断既用在提交前的预检（用户填表时就看到问题），
 * 也用在提交时的拦截，两处不会走岔。
 */

import { query, queryOne } from "../../db/client.js";
import { toCents } from "../../utils/money.js";
import { highestLevel, type ControlLevel } from "../controls/result.js";
import { listExpenseStandards } from "../expense-standards/store.js";
import { auditReimbursement, type AuditFinding, type AuditInvoice } from "./audit.js";
import type { ReimbursementRow } from "./store.js";

export interface AuditOutcome {
  level: ControlLevel;
  findings: AuditFinding[];
}

/**
 * 审核一张报销单。
 *
 * 返回收敛后的级别与逐条结论。调用方据 `level` 决定：`block` 拦住提交，
 * `escalate` 走加签，其余放行。
 */
export async function runReimbursementAudit(
  companyId: string,
  reimbursement: ReimbursementRow
): Promise<AuditOutcome> {
  const company = await queryOne<{ name: string; credit_code: string | null }>(
    `select name, credit_code from companies where id = $1`,
    [companyId]
  );

  const invoiceIds = reimbursement.lines
    .map((line) => line.invoiceId)
    .filter((id): id is string => id !== null);

  const invoices = new Map<string, AuditInvoice>();
  if (invoiceIds.length > 0) {
    const rows = await query<{
      id: string;
      invoice_no: string;
      buyer_name: string | null;
      buyer_tax_no: string | null;
      total_amount: string | null;
    }>(
      `select id, invoice_no, buyer_name, buyer_tax_no, total_amount
         from invoices where company_id = $1 and id = any($2::text[])`,
      [companyId, invoiceIds]
    );
    for (const row of rows) {
      invoices.set(row.id, {
        invoiceNo: row.invoice_no,
        buyerName: row.buyer_name,
        buyerTaxNo: row.buyer_tax_no,
        totalAmountCents: toCents(row.total_amount ?? "0")
      });
    }
  }

  // 已被**其他**单据占用的发票。排除本单自己——重新审核一张已保存的单据时，
  // 它自己占的票不该被报成重复。
  const usedInvoiceIds = new Set<string>();
  if (invoiceIds.length > 0) {
    const rows = await query<{ invoice_id: string }>(
      `select distinct l.invoice_id
         from reimbursement_lines l
         join reimbursements r on r.id = l.reimbursement_id
        where l.company_id = $1
          and l.invoice_id = any($2::text[])
          and r.id <> $3
          -- 已作废的单据不算占用：那张票可以重新报。
          and r.status <> 'cancelled'`,
      [companyId, invoiceIds, reimbursement.id]
    );
    for (const row of rows) usedInvoiceIds.add(row.invoice_id);
  }

  // 申请人职级与目的地城市等级：FT 的用户档案里目前没有这两项，
  // 传 null 会让匹配只命中通配标准（match.ts 的既定行为）。
  // **记入残留清单**——补上职级后，按职级的差旅标准才真正生效。
  const standards = await listExpenseStandards(companyId);

  const findings = auditReimbursement({
    company: { name: company?.name ?? "", creditCode: company?.credit_code ?? null },
    lines: reimbursement.lines.map((line) => ({
      lineId: line.id,
      expenseType: line.expenseType,
      amountCents: line.amountCents,
      quantity: line.quantity,
      invoiceId: line.invoiceId
    })),
    invoices,
    usedInvoiceIds,
    standards,
    onDate: reimbursement.expenseDate,
    gradeCode: null,
    cityTier: null
  });

  return { level: highestLevel(findings), findings };
}
