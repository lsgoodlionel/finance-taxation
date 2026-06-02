/**
 * 银行账户与流水 API
 * GET  /api/banking/accounts
 * POST /api/banking/accounts
 * GET  /api/banking/statements
 * POST /api/banking/statements/import
 * PATCH /api/banking/statements/:id/match
 * GET  /api/banking/statements/unmatched
 */

import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { parseBankStatementCsv } from "./statement-parser.js";
import { runReconciliation } from "./reconciliation.js";

// ── Bank accounts ─────────────────────────────────────────────────────────────

export async function listBankAccounts(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await query(
    "SELECT * FROM bank_accounts WHERE company_id = $1 ORDER BY is_primary DESC, created_at ASC",
    [req.auth!.companyId],
  );
  json(res, 200, { items, total: items.length });
}

export async function createBankAccount(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as {
    bankName: string; bankCode?: string; accountNo: string; accountName: string;
    currency?: string; isPrimary?: boolean; isPayroll?: boolean; notes?: string;
  };
  if (!body.bankName || !body.accountNo || !body.accountName) {
    json(res, 400, { error: "bankName, accountNo, accountName 为必填项" }); return;
  }
  const id = `ba-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (body.isPrimary) {
    await query("UPDATE bank_accounts SET is_primary = false WHERE company_id = $1", [cid]);
  }
  await query(
    `INSERT INTO bank_accounts
       (id, company_id, bank_name, bank_code, account_no, account_name, currency, is_primary, is_payroll, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`,
    [id, cid, body.bankName, body.bankCode ?? null, body.accountNo, body.accountName,
     body.currency ?? "CNY", body.isPrimary ?? false, body.isPayroll ?? false, body.notes ?? ""],
  );
  writeAudit({ companyId: cid, action: "banking.account.created", resourceType: "bank_account", resourceId: id });
  json(res, 201, { id, ok: true });
}

// ── Bank statements ───────────────────────────────────────────────────────────

export async function listBankStatements(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const cid = req.auth!.companyId;
  const dateFrom    = url.searchParams.get("date_from");
  const dateTo      = url.searchParams.get("date_to");
  const matchStatus = url.searchParams.get("match_status");
  const page     = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, parseInt(url.searchParams.get("page_size") ?? "50", 10));
  const offset   = (page - 1) * pageSize;

  const params: unknown[] = [cid];
  const conds: string[] = ["company_id = $1"];
  if (dateFrom)    { conds.push(`transaction_date >= $${params.push(dateFrom)}`); }
  if (dateTo)      { conds.push(`transaction_date <= $${params.push(dateTo)}`); }
  if (matchStatus) { conds.push(`match_status = $${params.push(matchStatus)}`); }
  const where = conds.join(" AND ");

  const items = await query(
    `SELECT id, transaction_date, value_date, amount, balance, counterparty_name, counterparty_no,
            description, match_status, matched_voucher_id, matched_event_id, transaction_ref, imported_at
     FROM bank_statements WHERE ${where}
     ORDER BY transaction_date DESC LIMIT $${params.push(pageSize)} OFFSET $${params.push(offset)}`,
    params,
  );
  const countRows = await query<{ count: string }>(
    `SELECT count(*)::text as count FROM bank_statements WHERE ${where}`,
    params.slice(0, params.length - 2),
  );
  json(res, 200, { items, total: parseInt(countRows[0]?.count ?? "0", 10), page, pageSize });
}

export async function importBankStatements(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const bankAccountId = url.searchParams.get("account_id") ?? null;
  const csvText = await readBodyText(req);
  if (!csvText.trim()) { json(res, 400, { error: "CSV内容为空" }); return; }

  const parsed = parseBankStatementCsv(csvText);
  const importBatch = `import-${Date.now()}`;
  let inserted = 0;
  let skipped = 0;

  for (const row of parsed.rows) {
    try {
      const id = `bs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await query(
        `INSERT INTO bank_statements
           (id, company_id, bank_account_id, transaction_date, value_date, amount, balance,
            counterparty_name, counterparty_no, transaction_ref, description, import_batch, imported_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         ON CONFLICT (company_id, transaction_ref) DO NOTHING`,
        [id, cid, bankAccountId, row.transactionDate, row.valueDate, row.amount, row.balance,
         row.counterpartyName, row.counterpartyNo, row.transactionRef, row.description, importBatch],
      );
      inserted++;
    } catch { skipped++; }
  }

  void runReconciliation(cid, { importBatch });
  writeAudit({ companyId: cid, action: "banking.statement.imported", resourceType: "bank_statement",
    changes: { format: parsed.detectedFormat, inserted, skipped } });
  json(res, 200, { ok: true, detectedFormat: parsed.detectedFormat, totalRows: parsed.totalRows,
    inserted, skipped, errorRows: parsed.errorRows, importBatch });
}

export async function matchStatement(req: ApiRequest, res: ServerResponse, statementId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { voucherId?: string; eventId?: string; matchStatus?: string };
  await query(
    `UPDATE bank_statements SET match_status=$1, matched_voucher_id=$2, matched_event_id=$3
     WHERE id=$4 AND company_id=$5`,
    [body.matchStatus ?? "manual", body.voucherId ?? null, body.eventId ?? null, statementId, cid],
  );
  writeAudit({ companyId: cid, action: "banking.statement.matched", resourceType: "bank_statement",
    resourceId: statementId });
  json(res, 200, { ok: true });
}

export async function getUnmatchedSummary(req: ApiRequest, res: ServerResponse): Promise<void> {
  const rows = await query<{ match_status: string; count: string; total_amount: string }>(
    `SELECT match_status, count(*)::text as count, sum(amount)::text as total_amount
     FROM bank_statements WHERE company_id=$1 GROUP BY match_status`,
    [req.auth!.companyId],
  );
  const summary = Object.fromEntries(rows.map((r) => [
    r.match_status, { count: parseInt(r.count, 10), totalAmount: parseFloat(r.total_amount ?? "0") },
  ]));
  json(res, 200, summary);
}

function readBodyText(req: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString("utf8"); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
