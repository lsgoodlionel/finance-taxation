/**
 * 数电票（全电发票）结构化解析（D4）。
 *
 * 数电票默认已是结构化数据，无需 OCR：把上游 payload 规范化为内部发票模型，
 * 金额统一转为分（整数），并校验必填项与「不含税 + 税额 = 价税合计」。纸票/
 * 影像的 PaddleOCR 自托管识别是独立部署项，不在此纯解析范围内。
 */

export interface NormalizedEInvoice {
  invoiceNumber: string;
  issueDate: string;
  sellerTaxNo: string;
  buyerTaxNo: string;
  amountCents: number;
  taxCents: number;
  totalCents: number;
}

export interface EInvoiceParseResult {
  ok: boolean;
  invoice?: NormalizedEInvoice;
  errors: string[];
}

function toCents(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n * 100);
}

function requireString(source: Record<string, unknown>, key: string, errors: string[]): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${key} 缺失或非法`);
    return "";
  }
  return value.trim();
}

function requireCents(source: Record<string, unknown>, key: string, errors: string[]): number {
  const cents = toCents(source[key]);
  if (cents === null) {
    errors.push(`${key} 金额非法`);
    return 0;
  }
  return cents;
}

export function parseEInvoice(raw: unknown): EInvoiceParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["发票数据必须是对象"] };
  }
  const source = raw as Record<string, unknown>;
  const errors: string[] = [];

  const invoiceNumber = requireString(source, "invoiceNumber", errors);
  const issueDate = requireString(source, "issueDate", errors);
  const sellerTaxNo = requireString(source, "sellerTaxNo", errors);
  const buyerTaxNo = requireString(source, "buyerTaxNo", errors);
  const amountCents = requireCents(source, "amount", errors);
  const taxCents = requireCents(source, "tax", errors);
  const totalCents = requireCents(source, "total", errors);

  if (errors.length === 0 && amountCents + taxCents !== totalCents) {
    errors.push(`价税合计不符：不含税 ${amountCents} + 税额 ${taxCents} ≠ 合计 ${totalCents}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    errors: [],
    invoice: { invoiceNumber, issueDate, sellerTaxNo, buyerTaxNo, amountCents, taxCents, totalCents }
  };
}
