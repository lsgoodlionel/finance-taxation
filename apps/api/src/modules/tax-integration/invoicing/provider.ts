/**
 * 开票连接器抽象（D1）——为持牌第三方开票 API（诺诺/百望）预留统一接口。
 *
 * 应用只依赖 InvoiceProvider 接口；本地/测试用 MockInvoiceProvider，生产切换为
 * 诺诺沙箱→生产的真实实现（需外部凭证，见部署清单）。金额一律以分为整数。
 */

export interface InvoiceLineItem {
  name: string;
  /** 不含税金额（分）。 */
  amountCents: number;
  /** 税率，如 0.13。 */
  taxRate: number;
}

export interface IssueInvoiceRequest {
  sellerTaxNo: string;
  buyerTaxNo: string;
  buyerName: string;
  items: InvoiceLineItem[];
  /** 调用方幂等键；同键重复开票应返回同一张发票。 */
  idempotencyKey: string;
}

export type InvoiceStatus = "issued" | "pending" | "failed";

export interface IssueInvoiceResult {
  ok: boolean;
  invoiceNumber?: string;
  amountCents?: number;
  taxCents?: number;
  totalCents?: number;
  status?: InvoiceStatus;
  error?: string;
}

export type InvoiceQueryStatus = "valid" | "invalid" | "not_found";

export interface QueryInvoiceResult {
  ok: boolean;
  invoiceNumber: string;
  status: InvoiceQueryStatus;
}

export interface InvoiceProvider {
  /** 提供方标识，如 'mock' / 'nuonuo'。 */
  readonly name: string;
  /** 开具发票。 */
  issue(request: IssueInvoiceRequest): Promise<IssueInvoiceResult>;
  /** 查验发票状态。 */
  query(invoiceNumber: string): Promise<QueryInvoiceResult>;
}

/** 计算一张发票的合计（不含税 / 税额 / 价税合计，分）。四舍五入到分。 */
export function computeInvoiceTotals(items: readonly InvoiceLineItem[]): {
  amountCents: number;
  taxCents: number;
  totalCents: number;
} {
  let amountCents = 0;
  let taxCents = 0;
  for (const item of items) {
    amountCents += item.amountCents;
    taxCents += Math.round(item.amountCents * item.taxRate);
  }
  return { amountCents, taxCents, totalCents: amountCents + taxCents };
}
