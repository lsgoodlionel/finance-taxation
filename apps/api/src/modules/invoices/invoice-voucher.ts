/**
 * 从发票生成记账凭证草稿（P2-10）
 *
 * 进项发票（input）：
 *   借 管理费用-其他 6301e07        (不含税金额)
 *   借 应交税费-应交增值税（进项）222102 (税额)
 *   贷 应付账款 2202                (价税合计)
 * 销项发票（output）：
 *   借 应收账款 1122                (价税合计)
 *   贷 主营业务收入 6001            (不含税金额)
 *   贷 应交税费-应交增值税（销项）222101 (税额)
 *
 * 纯函数、借贷平衡；具体科目由会计在草稿中按业务调整。
 *
 * 科目码必须是 accounts/chart-of-accounts.ts 里登记的**叶子**科目：这里此前用了
 * 表外的 6602 和非叶子的 2221，凭证一落账就污染报表口径。
 */

export interface InvoiceForVoucher {
  direction: string;       // input | output
  sellerName: string;
  buyerName: string;
  invoiceNo: string;
  amount: number;          // 不含税
  taxAmount: number;       // 税额
  totalAmount: number;     // 价税合计
}

export interface VoucherLineDraft {
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface InvoiceVoucherDraft {
  voucherType: "accrual" | "payment";
  summary: string;
  lines: VoucherLineDraft[];
}

function fmt(n: number): string { return n.toFixed(2); }
function round2(n: number): number { return Number(n.toFixed(2)); }

function line(summary: string, code: string, name: string, debit: number, credit: number): VoucherLineDraft {
  return { summary, accountCode: code, accountName: name, debit: fmt(debit), credit: fmt(credit) };
}

export function buildInvoiceVoucherDraft(inv: InvoiceForVoucher): InvoiceVoucherDraft {
  const amount = round2(inv.amount);
  const tax = round2(inv.taxAmount);
  const total = round2(inv.totalAmount > 0 ? inv.totalAmount : amount + tax);

  if (inv.direction === "output") {
    return {
      voucherType: "accrual",
      summary: `销项发票 No.${inv.invoiceNo} ${inv.buyerName}`,
      lines: [
        line(`应收账款—${inv.buyerName}`, "1122", "应收账款", total, 0),
        line("确认主营业务收入", "6001", "主营业务收入", 0, amount),
        ...(tax > 0 ? [line("应交税费—应交增值税（销项税额）", "222101", "应交税费-应交增值税（销项）", 0, tax)] : []),
      ],
    };
  }

  // input（默认）
  return {
    voucherType: "payment",
    summary: `进项发票 No.${inv.invoiceNo} ${inv.sellerName}`,
    lines: [
      line("确认费用/采购成本", "6301e07", "管理费用-其他", amount, 0),
      ...(tax > 0 ? [line("应交税费—应交增值税（进项税额）", "222102", "应交税费-应交增值税（进项）", tax, 0)] : []),
      line(`应付账款—${inv.sellerName}`, "2202", "应付账款", 0, total),
    ],
  };
}

export function isVoucherBalanced(draft: InvoiceVoucherDraft): boolean {
  const d = draft.lines.reduce((s, l) => s + Number(l.debit), 0);
  const c = draft.lines.reduce((s, l) => s + Number(l.credit), 0);
  return round2(d) === round2(c);
}
