/**
 * P5 银行 API 直连 HTTP 路由
 * POST /api/banking/sync-statements                       通过银行 API 拉取流水并自动对账
 * POST /api/payroll/transfer/batches/:id/submit-api       通过银行 API 推送代发指令
 */

import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { loadBankApiConfig } from "../settings/integration-config.routes.js";
import { fetchStatements, submitPayrollTransfer, type SubmitTransferLine } from "./bank-api.js";
import { runReconciliation } from "./reconciliation.js";
import { getBatchWithLines, markDisbursed } from "../payroll/transfer.js";

// ── 拉取流水并自动对账 ────────────────────────────────────────────────────────

export async function syncStatementsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { accountId?: string; accountNo?: string; dateFrom?: string; dateTo?: string };

  const cfg = await loadBankApiConfig(cid);
  const result = await fetchStatements(cfg, {
    accountNo: body.accountNo,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
  });
  if (!result.ok) {
    json(res, 400, { error: result.message, provider: cfg.provider });
    return;
  }

  const importBatch = `api-${Date.now()}`;
  let inserted = 0;
  let skipped = 0;
  for (const s of result.statements) {
    try {
      const id = `bs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rows = await query<{ id: string }>(
        `INSERT INTO bank_statements
           (id, company_id, bank_account_id, transaction_date, value_date, amount, balance,
            counterparty_name, counterparty_no, transaction_ref, description, import_batch, imported_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
         ON CONFLICT (company_id, transaction_ref) DO NOTHING
         RETURNING id`,
        [id, cid, body.accountId ?? null, s.transactionDate, s.valueDate, s.amount, s.balance,
         s.counterpartyName, s.counterpartyNo, s.transactionRef, s.description, importBatch],
      );
      if (rows.length > 0) inserted++; else skipped++;
    } catch { skipped++; }
  }

  // 拉取后自动对账（与 CSV 导入一致）
  const recon = await runReconciliation(cid, { importBatch });

  writeAudit({
    companyId: cid, action: "banking.api.synced", resourceType: "bank_statement",
    changes: { provider: cfg.provider, fetched: result.statements.length, inserted, skipped },
  });
  json(res, 200, {
    ok: true, provider: cfg.provider,
    fetched: result.statements.length, inserted, skipped, importBatch,
    reconciliation: recon,
  });
}

// ── 通过 API 推送代发指令 ─────────────────────────────────────────────────────

export async function submitTransferApiRoute(req: ApiRequest, res: ServerResponse, batchId: string): Promise<void> {
  const cid = req.auth!.companyId;
  const data = await getBatchWithLines(cid, batchId);
  if (!data) { json(res, 404, { error: "代发批次不存在" }); return; }
  if (data.batch.status !== "approved" && data.batch.status !== "exported") {
    json(res, 400, { error: `仅已审批/已导出批次可提交代发，当前为「${data.batch.status}」` });
    return;
  }

  const lines: SubmitTransferLine[] = data.lines
    .filter((l) => l.status === "normal")
    .map((l) => ({ accountNo: l.salary_account, accountName: l.employee_name, amount: Number(l.amount) }));
  if (lines.length === 0) {
    json(res, 400, { error: "批次无有效代发明细（员工银行账号均缺失）" });
    return;
  }

  const cfg = await loadBankApiConfig(cid);
  const result = await submitPayrollTransfer(cfg, { period: data.batch.payroll_period, lines });
  if (!result.ok) {
    json(res, 400, { error: result.message, provider: cfg.provider });
    return;
  }

  // 成功：推进到 exported（若仍为 approved）后标记已代发并联动经营事项
  if (data.batch.status === "approved") {
    await query(
      "UPDATE payroll_transfer_batches SET status='exported', exported_at=now(), updated_at=now() WHERE id=$1",
      [batchId],
    );
  }
  const disbursed = await markDisbursed(cid, batchId, req.auth!.userId, result.bankTransferRef ?? undefined);

  json(res, 200, {
    ok: true, provider: cfg.provider,
    bankTransferRef: result.bankTransferRef, message: result.message,
    eventId: disbursed.eventId,
  });
}
