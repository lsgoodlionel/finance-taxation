import type { ObjectSchema } from "../../utils/validate.js";

/**
 * F9 request-body validation schemas for voucher / ledger / report-snapshot
 * routes (see apps/api/src/modules/vouchers/routes.ts,
 * apps/api/src/modules/ledger/routes.ts,
 * apps/api/src/modules/ledger/close-period.ts and
 * apps/api/src/modules/reports/routes.ts).
 *
 * Only routes whose handler actually reads `req.body` are included here.
 * `required` is set only where the handler itself rejects the request (400)
 * when the field is missing.
 *
 * Omitted on purpose (handler never reads req.body — URL params only):
 * - POST /api/vouchers/:id/approve — approveVoucher only uses target/req.auth.
 * - POST /api/ledger/periods/:id/close-income — closeIncomeRoute only uses
 *   the `period` URL param.
 * - POST /api/ledger/periods/:id/lock — lockAccountingPeriod only uses the
 *   `period` URL param + req.auth.
 * - POST /api/ledger/periods/:id/unlock — unlockAccountingPeriod only uses
 *   the `period` URL param.
 */
export const vouchersLedgerBodySchemas: Record<string, ObjectSchema> = {
  "POST /api/vouchers": {
    // createVoucherFromTemplate 400s when any of these three is falsy
    // (empty string included), so min:1 mirrors the existing JS-truthy check.
    // enum mirrors the fixed template key list in vouchers/templates.ts —
    // an unknown key is already rejected downstream with a 400, this just
    // fails fast at the boundary.
    templateKey: {
      type: "string",
      required: true,
      min: 1,
      enum: ["sales", "procurement", "expense", "payroll", "asset", "financing-equity", "financing-loan", "rnd", "tax-income", "tax-surcharge"]
    },
    amount: { type: "string", required: true, min: 1 },
    businessEventId: { type: "string", required: true, min: 1 },
    summary: { type: "string" }
  },

  "PUT /api/vouchers/:id": {
    // updateVoucher reads only body.status / body.summary (Partial<Voucher>);
    // both fall back to the existing voucher's value when absent, so neither
    // is required. enum mirrors domain-model's VoucherStatus.
    status: { type: "string", enum: ["draft", "review_required", "posted"] },
    summary: { type: "string" }
  },

  "POST /api/vouchers/:id/post": {
    // postVoucher defaults both to req.auth's user when absent.
    authorizerUserId: { type: "string" },
    authorizerName: { type: "string" }
  },

  "POST /api/reports/snapshots": {
    // createReportSnapshot defaults reportType to "balance_sheet" and
    // periodType to "month" when absent; enums mirror domain-model's
    // ReportType / ReportPeriodType.
    reportType: { type: "string", enum: ["balance_sheet", "profit_statement", "cash_flow"] },
    periodType: { type: "string", enum: ["month", "quarter", "year"] }
  }
};
