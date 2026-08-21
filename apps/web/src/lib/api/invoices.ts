/**
 * 发票 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ─── P1: Invoices ─────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  direction: "input" | "output";
  invoice_type: string;
  invoice_code: string | null;
  invoice_no: string;
  invoice_date: string;
  seller_name: string;
  seller_tax_no: string;
  buyer_name: string;
  buyer_tax_no: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  tax_rate: number;
  verify_status: "pending" | "verified" | "invalid" | "error";
  verify_message: string | null;
  verified_at: string | null;
  business_event_id: string | null;
  document_id: string | null;
  voucher_id: string | null;
  source: "manual" | "ocr" | "import";
  notes: string;
  created_at: string;
}

export async function listInvoices(params?: {
  direction?: string; verifyStatus?: string; dateFrom?: string; dateTo?: string;
  page?: number; pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.direction)    q.set("direction", params.direction);
  if (params?.verifyStatus) q.set("verify_status", params.verifyStatus);
  if (params?.dateFrom)     q.set("date_from", params.dateFrom);
  if (params?.dateTo)       q.set("date_to", params.dateTo);
  if (params?.page)         q.set("page", String(params.page));
  if (params?.pageSize)     q.set("page_size", String(params.pageSize));
  const qs = q.toString();
  return request<{ items: Invoice[]; total: number; page: number; pageSize: number }>(
    `/api/invoices${qs ? "?" + qs : ""}`,
  );
}

export async function createInvoice(data: {
  direction?: string; invoiceType?: string; invoiceCode?: string;
  invoiceNo: string; invoiceDate: string; sellerName: string;
  sellerTaxNo?: string; buyerName?: string; buyerTaxNo?: string;
  amount?: number; taxAmount?: number; totalAmount?: number; taxRate?: number;
  businessEventId?: string; source?: string; notes?: string;
}) {
  return request<{ id: string; ok: boolean }>("/api/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function verifyInvoice(id: string) {
  return request<{ verifyStatus: string; message: string }>(`/api/invoices/${id}/verify`, {
    method: "POST",
  });
}

export async function ocrInvoice(data: { imageBase64?: string; text?: string }) {
  return request<{ extracted: Record<string, unknown> | null; confidence: string }>(
    "/api/invoices/ocr",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
  );
}

export async function deleteInvoice(id: string) {
  return request<{ ok: boolean }>(`/api/invoices/${id}`, { method: "DELETE" });
}

export async function generateInvoiceVoucher(id: string) {
  return request<{ ok: boolean; voucherId: string; eventId: string; summary: string }>(
    `/api/invoices/${id}/voucher`, { method: "POST", body: JSON.stringify({}) }
  );
}
