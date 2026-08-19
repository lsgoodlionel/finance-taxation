/**
 * 发票匹配建议的取数（V14-D）。
 *
 * 打分全在 `match.ts`（纯函数），这里只负责把候选票捞出来。
 *
 * ## 「未被占用」是必要条件，不是加分项
 *
 * 一张票只能报一次。已经挂在别的报销单上的票**根本不出现在候选里**，
 * 而不是排在后面——排在后面意味着它还是可能被选中，而选中之后
 * 库层的唯一约束才拦住，用户看到的是一个莫名其妙的报错。
 *
 * 已经生成过凭证的票同理：它已经入账了。
 */

import { query } from "../../db/client.js";
import { rankInvoices, type InvoiceCandidate, type MatchSuggestion } from "./match.js";

export interface SuggestInput {
  companyId: string;
  amountCents: number;
  expenseOn: string;
  keyword: string | null;
  /**
   * 正在编辑的报销单。它自己已挂的票要排除，但**不能把它自己占用的算成
   * 别人占用**——否则用户重新打开一张已保存的单据时，已经选好的票会
   * 从候选里消失，看起来像丢了。
   */
  excludeReimbursementId?: string | null;
  limit: number;
}

export interface SuggestResult {
  suggestions: MatchSuggestion[];
  /** 候选池里符合条件的总数。**截断了要说出来**——不说等于假装全看过了。 */
  totalCandidates: number;
  truncated: boolean;
}

interface InvoiceDbRow {
  id: string;
  invoice_no: string;
  invoice_date: string | Date;
  seller_name: string | null;
  total_amount: string | number;
  verify_status: string | null;
}

export async function suggestInvoices(input: SuggestInput): Promise<SuggestResult> {
  const rows = await query<InvoiceDbRow>(
    `select i.id, i.invoice_no, i.invoice_date, i.seller_name, i.total_amount, i.verify_status
       from invoices i
      where i.company_id = $1
        -- 进项票才可能是报销的凭据。销项是我方开出去的。
        and i.direction = 'input'
        -- 已入账的不再出现：它已经有凭证了。
        and i.voucher_id is null
        -- 已被别的报销单占用的不出现。**这是必要条件不是减分项**——
        -- 排在后面意味着还可能被选中，而选中后由库层唯一约束报一个
        -- 用户看不懂的错。
        and not exists (
          select 1 from reimbursement_lines rl
           where rl.invoice_id = i.id
             and ($2::text is null or rl.reimbursement_id <> $2)
        )
      order by i.invoice_date desc`,
    [input.companyId, input.excludeReimbursementId ?? null]
  );

  const candidates: InvoiceCandidate[] = rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoice_no,
    invoiceDate:
      row.invoice_date instanceof Date
        ? row.invoice_date.toISOString().slice(0, 10)
        : String(row.invoice_date).slice(0, 10),
    sellerName: row.seller_name,
    // 发票金额存的是元（numeric），报销金额存的是分。**在这里换算一次**，
    // 让打分函数只见整数分——两种单位混在一个函数里迟早比错。
    totalAmountCents: Math.round(Number(row.total_amount) * 100),
    verifyStatus: row.verify_status
  }));

  const ranked = rankInvoices(
    {
      amountCents: input.amountCents,
      expenseOn: input.expenseOn,
      keyword: input.keyword
    },
    candidates
  );

  return {
    suggestions: ranked.slice(0, input.limit),
    totalCandidates: ranked.length,
    truncated: ranked.length > input.limit
  };
}
