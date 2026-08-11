/**
 * 从发票生成记账凭证草稿（P2-10）
 *
 * 销项发票（output）——与发票类型无关：
 *   借 应收账款 1122                (价税合计)
 *   贷 主营业务收入 6001            (不含税金额)
 *   贷 应交税费-应交增值税（销项）222101 (税额)
 * 销项税额只要发生就要交，普票同样有销项税；收据没有税额，`taxAmount` 为 0 时
 * 税金行自动省略，无需按类型分支。
 *
 * 进项发票（input）——**按发票类型分两种做法**（V12-A4 / 蓝图 E3）：
 *
 *   可抵扣（增值税专用发票）：
 *     借 管理费用-其他 6301e07        (不含税金额)
 *     借 应交税费-应交增值税（进项）222102 (税额)
 *     贷 应付账款 2202                (价税合计)
 *
 *   不可抵扣（普票 / 电子发票 / 收据 / 其他 / 类型缺失）：
 *     借 管理费用-其他 6301e07        (价税合计 —— 税额并入成本费用)
 *     贷 应付账款 2202                (价税合计)
 *
 * 此前**只 switch 了 `direction`**，进项一律挂 222102：普通发票被当成专用发票做了
 * 进项抵扣，增值税申报少缴税。不可抵扣的进项税额按税法应计入相关成本费用，
 * 不得进项抵扣，因此这里并入 6301e07 而不是 222102。
 *
 * 纯函数、借贷平衡；具体科目由会计在草稿中按业务调整。
 *
 * 科目码必须是 accounts/chart-of-accounts.ts 里登记的**叶子**科目：这里此前用了
 * 表外的 6602 和非叶子的 2221，凭证一落账就污染报表口径。
 */

import { isInputTaxDeductible } from "./invoice-types.js";

export interface InvoiceForVoucher {
  direction: string;       // input | output
  /**
   * 发票类型（见 invoice-types.ts）。**可选**：省略或无法识别时按「不可抵扣」处理。
   *
   * 保守默认的理由是错误方向的代价不对称——判错成不可抵扣是多缴税，看得见、可纠正；
   * 判错成可抵扣是少缴税，属于税务违规。
   */
  invoiceType?: string | null;
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
  const isDeductible = isInputTaxDeductible(inv.invoiceType);

  // 不可抵扣时税额并入成本费用，借方就是价税合计；可抵扣时借方只是不含税金额，
  // 税额单独走 222102。两种情形贷方都是价税合计，因此都天然借贷平衡。
  const costAmount = isDeductible ? amount : total;
  const hasDeductibleTaxLine = isDeductible && tax > 0;
  const costSummary = !isDeductible && tax > 0
    ? "确认费用/采购成本（含不可抵扣进项税）"
    : "确认费用/采购成本";

  return {
    voucherType: "payment",
    summary: `进项发票 No.${inv.invoiceNo} ${inv.sellerName}`,
    lines: [
      line(costSummary, "6301e07", "管理费用-其他", costAmount, 0),
      ...(hasDeductibleTaxLine ? [line("应交税费—应交增值税（进项税额）", "222102", "应交税费-应交增值税（进项）", tax, 0)] : []),
      line(`应付账款—${inv.sellerName}`, "2202", "应付账款", 0, total),
    ],
  };
}

export function isVoucherBalanced(draft: InvoiceVoucherDraft): boolean {
  const d = draft.lines.reduce((s, l) => s + Number(l.debit), 0);
  const c = draft.lines.reduce((s, l) => s + Number(l.credit), 0);
  return round2(d) === round2(c);
}
