/**
 * 定期凭证的 HTTP 接线（V12-C4）。
 *
 * - `GET   /api/recurring-vouchers`             模板列表
 * - `POST  /api/recurring-vouchers`             建模板
 * - `PATCH /api/recurring-vouchers/:id`         启用 / 暂停
 * - `POST  /api/recurring-vouchers/generate`    为某期间生成草稿
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import {
  createRecurringVoucher,
  generateRecurringVouchers,
  listRecurringVouchers,
  setRecurringStatus,
  type RecurringLineInput
} from "./recurring-voucher.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseLines(raw: unknown): RecurringLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines: RecurringLineInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const line = item as Record<string, unknown>;
    const accountCode = typeof line.accountCode === "string" ? line.accountCode.trim() : "";
    if (!accountCode) return null;
    lines.push({
      accountCode,
      accountName: typeof line.accountName === "string" ? line.accountName : null,
      debit: line.debit == null ? "0" : String(line.debit),
      credit: line.credit == null ? "0" : String(line.credit),
      summary: typeof line.summary === "string" ? line.summary : null,
      counterpartyId: typeof line.counterpartyId === "string" ? line.counterpartyId : null
    });
  }
  return lines;
}

export async function listRecurringRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await withTransaction((client) =>
    listRecurringVouchers(client, req.auth!.companyId)
  );
  json(res, 200, { items, total: items.length });
}

export async function createRecurringRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const lines = parseLines(body.lines);
  if (!lines) {
    json(res, 400, {
      error: "lines 必须是非空数组，每项含 accountCode 与 debit/credit",
      code: "RECURRING_LINES_REQUIRED"
    });
    return;
  }

  const result = await withTransaction((client) =>
    createRecurringVoucher(client, {
      companyId: req.auth!.companyId,
      name: typeof body.name === "string" ? body.name : "",
      startPeriod: typeof body.startPeriod === "string" ? body.startPeriod.trim() : "",
      endPeriod: typeof body.endPeriod === "string" ? body.endPeriod.trim() : null,
      summaryTemplate:
        typeof body.summaryTemplate === "string" ? body.summaryTemplate : "定期凭证 {period}",
      voucherType: typeof body.voucherType === "string" ? body.voucherType : undefined,
      notes: typeof body.notes === "string" ? body.notes : null,
      lines
    })
  );

  if (!result.ok) {
    json(res, 400, { error: result.failure.message, ...result.failure });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "recurring.create",
    resourceType: "recurring_voucher",
    resourceId: result.recurring.id,
    resourceLabel: result.recurring.name,
    changes: { startPeriod: result.recurring.startPeriod, lineCount: result.recurring.lines.length }
  });

  json(res, 201, result.recurring);
}

export async function updateRecurringStatusRoute(
  req: ApiRequest,
  res: ServerResponse,
  recurringId: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = body.status === "paused" ? "paused" : body.status === "active" ? "active" : null;
  if (!status) {
    json(res, 400, { error: "status 只能是 active 或 paused", code: "RECURRING_STATUS_INVALID" });
    return;
  }

  const updated = await withTransaction((client) =>
    setRecurringStatus(client, req.auth!.companyId, recurringId, status)
  );
  if (!updated) {
    json(res, 404, { error: `找不到定期凭证模板 ${recurringId}`, code: "RECURRING_NOT_FOUND" });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: status === "paused" ? "recurring.pause" : "recurring.resume",
    resourceType: "recurring_voucher",
    resourceId: recurringId,
    resourceLabel: recurringId,
    changes: { status }
  });

  json(res, 200, { id: recurringId, status });
}

export async function generateRecurringRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = typeof body.period === "string" ? body.period.trim() : "";
  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 必填，格式 YYYY-MM", code: "PERIOD_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    generateRecurringVouchers(client, req.auth!.companyId, period, new Date().toISOString())
  );

  if (result.generated.length > 0) {
    writeAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: "recurring.generate",
      resourceType: "voucher",
      resourceId: period,
      resourceLabel: `生成定期凭证 ${period}`,
      changes: { count: result.generated.length, voucherIds: result.generated.map((g) => g.voucherId) }
    });
  }

  json(res, 200, result);
}
