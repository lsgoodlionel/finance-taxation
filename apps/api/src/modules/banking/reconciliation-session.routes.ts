/**
 * 银行余额调节表的 HTTP 接线（V12-C3）。
 *
 * - `GET  /api/banking/reconciliation/balance?bankAccountId=&asOf=&statementBalance=` 调节表预览
 * - `POST /api/banking/reconciliation/close`                                          封存
 * - `GET  /api/banking/reconciliation/sessions`                                       历史对账结论
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { fromCents } from "../../utils/money.js";
import { writeAudit } from "../../services/audit.js";
import {
  closeReconciliation,
  listReconciliations,
  previewReconciliation,
  type ReconciliationPreview
} from "./reconciliation-session.js";

function serializePreview(preview: ReconciliationPreview) {
  const { result } = preview;
  return {
    bankAccount: preview.bankAccount,
    asOf: preview.asOf,
    statementBalance: fromCents(result.statementBalanceCents),
    bookBalance: fromCents(result.bookBalanceCents),
    adjustedStatementBalance: fromCents(result.adjustedStatementCents),
    adjustedBookBalance: fromCents(result.adjustedBookCents),
    difference: fromCents(result.differenceCents),
    balanced: result.balanced,
    subtotals: {
      bookOnlyReceipt: fromCents(result.subtotals.book_only_receipt),
      bookOnlyPayment: fromCents(result.subtotals.book_only_payment),
      bankOnlyReceipt: fromCents(result.subtotals.bank_only_receipt),
      bankOnlyPayment: fromCents(result.subtotals.bank_only_payment)
    },
    items: result.items.map((item) => ({
      itemType: item.itemType,
      occurredOn: item.occurredOn,
      amount: fromCents(item.amountCents),
      description: item.description,
      sourceId: item.sourceId
    })),
    message: preview.message,
    sharedAccountWarning: preview.sharedAccountWarning
  };
}

export async function getBalanceReconciliationRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const bankAccountId = url.searchParams.get("bankAccountId") ?? "";
  const asOf = url.searchParams.get("asOf") ?? "";
  const statementBalance = url.searchParams.get("statementBalance");

  if (!bankAccountId) {
    json(res, 400, { error: "bankAccountId 必填", code: "BANK_ACCOUNT_REQUIRED" });
    return;
  }
  if (statementBalance == null) {
    json(res, 400, {
      // 对账单余额是外部事实，系统推算不出来；默认成 0 会让调节表算出一个
      // 看起来精确的差额，而那个数字毫无意义
      error: "statementBalance 必填——银行对账单余额需从对账单抄入，系统无从推算",
      code: "STATEMENT_BALANCE_REQUIRED"
    });
    return;
  }

  const result = await withTransaction((client) =>
    previewReconciliation(client, {
      companyId: req.auth!.companyId,
      bankAccountId,
      asOf,
      statementBalance
    })
  );

  if (!result.ok) {
    json(res, result.failure.code === "BANK_ACCOUNT_NOT_FOUND" ? 404 : 400, {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 200, serializePreview(result.preview));
}

export async function closeReconciliationRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bankAccountId = typeof body.bankAccountId === "string" ? body.bankAccountId.trim() : "";
  const asOf = typeof body.asOf === "string" ? body.asOf.trim() : "";
  if (!bankAccountId || body.statementBalance == null) {
    json(res, 400, {
      error: "bankAccountId 与 statementBalance 必填",
      code: "RECONCILIATION_FIELDS_REQUIRED"
    });
    return;
  }

  const result = await withTransaction((client) =>
    closeReconciliation(client, {
      companyId: req.auth!.companyId,
      bankAccountId,
      asOf,
      statementBalance: String(body.statementBalance),
      notes: typeof body.notes === "string" ? body.notes : null,
      acknowledgeDifference: body.acknowledgeDifference === true,
      closedBy: req.auth!.userId
    })
  );

  if (!result.ok) {
    const conflict =
      result.failure.code === "RECONCILIATION_CLOSED" ||
      result.failure.code === "DIFFERENCE_NOT_ACKNOWLEDGED";
    json(res, conflict ? 409 : 400, { error: result.failure.message, code: result.failure.code });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "banking.reconciliation.closed",
    resourceType: "bank_reconciliation",
    resourceId: result.reconciliationId,
    resourceLabel: `${asOf} 银行对账封存`,
    changes: {
      difference: fromCents(result.preview.result.differenceCents),
      balanced: result.preview.result.balanced,
      itemCount: result.preview.result.items.length
    }
  });

  json(res, 201, {
    reconciliationId: result.reconciliationId,
    ...serializePreview(result.preview)
  });
}

export async function listReconciliationSessionsRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await withTransaction((client) =>
    listReconciliations(client, req.auth!.companyId, url.searchParams.get("bankAccountId"))
  );
  json(res, 200, { items, total: items.length });
}
