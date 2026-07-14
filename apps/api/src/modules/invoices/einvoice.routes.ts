/**
 * 数电票（全电发票）解析入库 API
 * POST /api/invoices/parse
 *
 * 复用纯核心 parseEInvoice 完成结构化解析与价税合计校验，
 * 解析成功后落库到 invoices 表（列集与 invoice.routes.ts#createInvoice 对齐）。
 */

import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { parseEInvoice } from "./einvoice-parse.js";

export async function parseAndStoreEInvoice(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { direction?: string };

  const result = parseEInvoice(req.body);
  if (!result.ok || !result.invoice) {
    json(res, 400, { ok: false, errors: result.errors });
    return;
  }

  const { invoice } = result;
  const id = randomUUID();
  const sellerName = invoice.sellerTaxNo;
  const buyerName = invoice.buyerTaxNo;

  await query(
    `INSERT INTO invoices
       (id, company_id, direction, invoice_type, invoice_no, invoice_date,
        seller_name, seller_tax_no, buyer_name, buyer_tax_no,
        amount, tax_amount, total_amount, source, verify_status,
        created_at, updated_at)
     VALUES ($1,$2,$3,'electronic',$4,$5,$6,$7,$8,$9,$10,$11,$12,'import','pending',now(),now())`,
    [
      id, cid, body.direction ?? "input",
      invoice.invoiceNumber, invoice.issueDate,
      sellerName, invoice.sellerTaxNo, buyerName, invoice.buyerTaxNo,
      invoice.amountCents / 100, invoice.taxCents / 100, invoice.totalCents / 100
    ]
  );

  writeAudit({
    companyId: cid, userId: req.auth!.userId, action: "invoice.einvoice.parsed",
    resourceType: "invoice", resourceId: id,
    changes: { invoiceNo: invoice.invoiceNumber, totalAmount: invoice.totalCents / 100 }
  });

  json(res, 200, { ok: true, invoiceId: id, invoice });
}
