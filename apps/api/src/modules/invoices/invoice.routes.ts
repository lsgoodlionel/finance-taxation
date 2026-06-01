/**
 * 发票台账 API
 * GET  /api/invoices
 * POST /api/invoices
 * PATCH /api/invoices/:id
 * POST /api/invoices/:id/verify
 * POST /api/invoices/ocr
 * DELETE /api/invoices/:id
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { verifyInvoiceLocally, ocrExtractInvoice } from "./invoice-verify.js";

// ── 发票列表 ──────────────────────────────────────────────────────────────────

export async function listInvoices(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const cid = req.auth!.companyId;
  const direction    = url.searchParams.get("direction");
  const verifyStatus = url.searchParams.get("verify_status");
  const dateFrom     = url.searchParams.get("date_from");
  const dateTo       = url.searchParams.get("date_to");
  const page     = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, parseInt(url.searchParams.get("page_size") ?? "50", 10));
  const offset   = (page - 1) * pageSize;

  const params: unknown[] = [cid];
  const conds = ["company_id = $1"];
  if (direction)    { conds.push(`direction = $${params.push(direction)}`); }
  if (verifyStatus) { conds.push(`verify_status = $${params.push(verifyStatus)}`); }
  if (dateFrom)     { conds.push(`invoice_date >= $${params.push(dateFrom)}`); }
  if (dateTo)       { conds.push(`invoice_date <= $${params.push(dateTo)}`); }
  const where = conds.join(" AND ");

  const items = await query(
    `SELECT id, direction, invoice_type, invoice_code, invoice_no, invoice_date,
            seller_name, seller_tax_no, buyer_name, buyer_tax_no,
            amount, tax_amount, total_amount, tax_rate,
            verify_status, verify_message, verified_at,
            business_event_id, document_id, source, notes, created_at
     FROM invoices WHERE ${where}
     ORDER BY invoice_date DESC, created_at DESC
     LIMIT $${params.push(pageSize)} OFFSET $${params.push(offset)}`,
    params,
  );
  const countRows = await query<{ count: string }>(
    `SELECT count(*)::text as count FROM invoices WHERE ${where}`,
    params.slice(0, params.length - 2),
  );
  json(res, 200, { items, total: parseInt(countRows[0]?.count ?? "0", 10), page, pageSize });
}

// ── 录入发票 ──────────────────────────────────────────────────────────────────

export async function createInvoice(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as {
    direction?: string; invoiceType?: string; invoiceCode?: string;
    invoiceNo: string; invoiceDate: string; sellerName: string;
    sellerTaxNo?: string; buyerName?: string; buyerTaxNo?: string;
    amount?: number; taxAmount?: number; totalAmount?: number; taxRate?: number;
    businessEventId?: string; documentId?: string; source?: string; notes?: string;
  };
  if (!body.invoiceNo || !body.invoiceDate || !body.sellerName) {
    json(res, 400, { error: "invoiceNo, invoiceDate, sellerName 为必填项" }); return;
  }
  const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const totalAmount = body.totalAmount ?? ((body.amount ?? 0) + (body.taxAmount ?? 0));
  const taxRate = body.taxRate ?? (body.amount && body.taxAmount && body.amount > 0 ? body.taxAmount / body.amount : 0);

  await query(
    `INSERT INTO invoices
       (id, company_id, direction, invoice_type, invoice_code, invoice_no, invoice_date,
        seller_name, seller_tax_no, buyer_name, buyer_tax_no,
        amount, tax_amount, total_amount, tax_rate,
        business_event_id, document_id, source, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now())`,
    [id, cid, body.direction ?? "input", body.invoiceType ?? "vat_special",
     body.invoiceCode ?? null, body.invoiceNo, body.invoiceDate,
     body.sellerName, body.sellerTaxNo ?? "", body.buyerName ?? "", body.buyerTaxNo ?? "",
     body.amount ?? 0, body.taxAmount ?? 0, totalAmount, taxRate,
     body.businessEventId ?? null, body.documentId ?? null,
     body.source ?? "manual", body.notes ?? ""],
  );
  writeAudit({ companyId: cid, action: "invoice.created", resourceType: "invoice", resourceId: id,
    changes: { invoiceNo: body.invoiceNo, totalAmount } });
  json(res, 201, { id, ok: true });
}

// ── 更新发票 ──────────────────────────────────────────────────────────────────

export async function updateInvoice(req: ApiRequest, res: ServerResponse, invoiceId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { notes?: string; businessEventId?: string; documentId?: string; voucherId?: string };
  await query(
    `UPDATE invoices SET notes=$1, business_event_id=$2, document_id=$3, voucher_id=$4, updated_at=now()
     WHERE id=$5 AND company_id=$6`,
    [body.notes ?? null, body.businessEventId ?? null, body.documentId ?? null, body.voucherId ?? null, invoiceId, cid],
  );
  json(res, 200, { ok: true });
}

// ── 发票验真 ──────────────────────────────────────────────────────────────────

export async function verifyInvoice(req: ApiRequest, res: ServerResponse, invoiceId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const invoice = await queryOne<{
    invoice_code: string | null; invoice_no: string; invoice_date: string;
    total_amount: string; seller_tax_no: string;
  }>(
    "SELECT invoice_code, invoice_no, invoice_date, total_amount, seller_tax_no FROM invoices WHERE id=$1 AND company_id=$2",
    [invoiceId, cid],
  );
  if (!invoice) { json(res, 404, { error: "发票不存在" }); return; }

  const result = await verifyInvoiceLocally({
    invoiceCode: invoice.invoice_code ?? "",
    invoiceNo: invoice.invoice_no,
    invoiceDate: invoice.invoice_date,
    totalAmount: parseFloat(invoice.total_amount),
    sellerTaxNo: invoice.seller_tax_no,
  });

  await query(
    `UPDATE invoices SET verify_status=$1, verify_message=$2, verified_at=now(), updated_at=now()
     WHERE id=$3 AND company_id=$4`,
    [result.status, result.message, invoiceId, cid],
  );
  writeAudit({ companyId: cid, action: "invoice.verified", resourceType: "invoice", resourceId: invoiceId,
    changes: { verifyStatus: result.status } });
  json(res, 200, { verifyStatus: result.status, message: result.message });
}

// ── OCR 识别 ──────────────────────────────────────────────────────────────────

export async function ocrInvoice(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { imageBase64?: string; imageUrl?: string; text?: string };
  if (!body.imageBase64 && !body.imageUrl && !body.text) {
    json(res, 400, { error: "需要提供 imageBase64、imageUrl 或 text 之一" }); return;
  }
  const extracted = await ocrExtractInvoice(cid, body.text ?? "", body.imageBase64);
  writeAudit({ companyId: cid, action: "invoice.ocr", resourceType: "invoice" });
  json(res, 200, { extracted, confidence: extracted ? "high" : "low" });
}

// ── 删除发票 ──────────────────────────────────────────────────────────────────

export async function deleteInvoice(req: ApiRequest, res: ServerResponse, invoiceId: string): Promise<void> {
  const cid = req.auth!.companyId;
  await query("DELETE FROM invoices WHERE id=$1 AND company_id=$2", [invoiceId, cid]);
  writeAudit({ companyId: cid, action: "invoice.deleted", resourceType: "invoice", resourceId: invoiceId });
  json(res, 200, { ok: true });
}
