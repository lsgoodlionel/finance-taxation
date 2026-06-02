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
import { query, queryOne, withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { verifyInvoiceWithConfig, verifyInvoiceLocally, ocrExtractInvoice } from "./invoice-verify.js";
import { buildInvoiceVoucherDraft, isVoucherBalanced } from "./invoice-voucher.js";

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
            business_event_id, document_id, voucher_id, source, notes, created_at
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

  // P2: 使用配置的服务商进行验真（默认 local，可在设置中切换为 baiwang/nuonuo/etax）
  const result = await verifyInvoiceWithConfig(cid, {
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

// ── P2-10：从发票一键生成记账凭证草稿 ─────────────────────────────────────────

export async function generateInvoiceVoucher(req: ApiRequest, res: ServerResponse, invoiceId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const inv = await queryOne<{
    id: string; direction: string; seller_name: string; buyer_name: string; invoice_no: string;
    amount: string; tax_amount: string; total_amount: string; business_event_id: string | null; voucher_id: string | null;
  }>("SELECT * FROM invoices WHERE id=$1 AND company_id=$2", [invoiceId, cid]);
  if (!inv) { json(res, 404, { error: "发票不存在" }); return; }
  if (inv.voucher_id) { json(res, 400, { error: "该发票已生成凭证" }); return; }

  const draft = buildInvoiceVoucherDraft({
    direction: inv.direction, sellerName: inv.seller_name, buyerName: inv.buyer_name, invoiceNo: inv.invoice_no,
    amount: Number(inv.amount), taxAmount: Number(inv.tax_amount), totalAmount: Number(inv.total_amount),
  });
  if (!isVoucherBalanced(draft)) { json(res, 500, { error: "生成的凭证借贷不平衡，已中止" }); return; }

  const now = new Date().toISOString();
  const eventId = inv.business_event_id ?? `evt-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mappingId = `ivd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const voucherId = `ivv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await withTransaction(async (client) => {
    // 发票无关联事项时，建一个承接事项（满足 vouchers.business_event_id 外键）
    if (!inv.business_event_id) {
      await client.query(
        `INSERT INTO business_events
           (id, company_id, type, title, description, department, occurred_on, amount, currency, status, source, created_at, updated_at)
         VALUES ($1,$2,'invoice',$3,$4,'财务',now()::date,$5,'CNY','analyzed','manual',$6,$6)`,
        [eventId, cid, `发票 No.${inv.invoice_no}`, `${inv.direction === "output" ? "销项" : "进项"}发票自动建账`, Number(inv.total_amount), now],
      );
      await client.query("UPDATE invoices SET business_event_id=$1 WHERE id=$2", [eventId, invoiceId]);
    }
    await client.query(
      `INSERT INTO event_voucher_drafts (id, company_id, business_event_id, voucher_type, status, summary, created_at)
       VALUES ($1,$2,$3,$4,'draft',$5,$6::timestamptz)`,
      [mappingId, cid, eventId, draft.voucherType, draft.summary, now],
    );
    await client.query(
      `INSERT INTO vouchers (id, company_id, business_event_id, mapping_id, voucher_type, summary, status, source, approved_at, posted_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'draft','analysis',null,null,$7::timestamptz,$7::timestamptz)`,
      [voucherId, cid, eventId, mappingId, draft.voucherType, draft.summary, now],
    );
    for (const [i, l] of draft.lines.entries()) {
      await client.query(
        `INSERT INTO voucher_draft_lines (id, draft_id, summary, account_code, account_name, debit, credit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
        [`${mappingId}-l${i + 1}`, mappingId, l.summary, l.accountCode, l.accountName, l.debit, l.credit, i],
      );
      await client.query(
        `INSERT INTO voucher_lines (id, voucher_id, summary, account_code, account_name, debit, credit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8)`,
        [`${voucherId}-l${i + 1}`, voucherId, l.summary, l.accountCode, l.accountName, l.debit, l.credit, i],
      );
    }
    await client.query("UPDATE invoices SET voucher_id=$1, updated_at=now() WHERE id=$2", [voucherId, invoiceId]);
  });

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "invoice.voucher_generated",
    resourceType: "invoice", resourceId: invoiceId, changes: { voucherId, eventId } });
  json(res, 201, { ok: true, voucherId, eventId, summary: draft.summary });
}
