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

  // 申请人职级（V13 残留 8 已补）。没设职级的用户仍传 null——
  // 那时只命中通配标准，是 match.ts 的既定行为，不会出错。
  const applicant = await queryOne<{ grade_code: string | null }>(
    `select grade_code from users where id = $1 and company_id = $2`,
    [reimbursement.applicantUserId, companyId]
  );
  const standards = await listExpenseStandards(companyId);

  // **逐行审核而不是整单一次**：城市等级在行上（一次出差可能跨城市），
  // 而超标判定要按行的城市匹配标准。整单传一个 cityTier 会让苏州那一晚
  // 按上海的标准判——而上海标准更宽，等于漏判。
  const findings = reimbursement.lines.flatMap((line) =>
    auditReimbursement({
      company: { name: company?.name ?? "", creditCode: company?.credit_code ?? null },
      lines: [
        {
          lineId: line.id,
          expenseType: line.expenseType,
          amountCents: line.amountCents,
          quantity: line.quantity,
          invoiceId: line.invoiceId
        }
      ],
      invoices,
      // 逐行调用时，同单内重复用票的检测会失效（每次只看一行）——
      // 所以把本单已出现过的票也并进「已占用」集合，由调用方在这里合并。
      usedInvoiceIds: new Set([
        ...usedInvoiceIds,
        ...reimbursement.lines
          .filter((other) => other.id !== line.id && other.invoiceId !== null)
          .map((other) => other.invoiceId!)
      ]),
      standards,
      onDate: reimbursement.expenseDate,
      gradeCode: applicant?.grade_code ?? null,
      cityTier: line.cityTier
    })
  );

  return { level: highestLevel(findings), findings };
}
