import type { ObjectSchema } from "../../utils/validate.js";

/**
 * F9 request-body validation schemas for tax / tax-integration routes.
 *
 * Only routes whose handler actually reads `req.body` are included here.
 * `required` is set only where the handler itself rejects the request
 * (400) when the field is missing — see each handler in
 * apps/api/src/modules/tax/routes.ts and
 * apps/api/src/modules/tax-integration/declaration-export.routes.ts.
 *
 * Omitted on purpose:
 * - POST /api/tax-filing-batches/:id/validate — validateTaxFilingBatch never
 *   reads req.body (batchId comes from the URL param only).
 * - itemIds on createTaxFilingBatch — FieldSpec has no array type.
 */
export const taxBodySchemas: Record<string, ObjectSchema> = {
  /**
   * 税款缴纳记录（V17 阶段三批次 B）。附加税以实缴主税为计税依据。
   *
   * 金额与日期的**取值范围校验放在 handler 里**：这里只做类型与必填，
   * 「金额必须正数」「日期必须 YYYY-MM-DD」要配错误码与说明文案，
   * 而 FieldSpec 给不出那些。
   */
  "POST /api/tax/payments": {
    taxType: { type: "string", required: true, min: 1, max: 40 },
    filingPeriod: { type: "string", required: true, min: 1, max: 20 },
    amountCents: { type: "number", required: true },
    paidOn: { type: "string", required: true, min: 1, max: 20 },
    note: { type: "string", max: 500 }
    // voucherId: nullable — omitted.
  },

  "POST /api/tax-filing-batches": {
    taxType: { type: "string", required: true, min: 1 },
    filingPeriod: { type: "string", required: true, min: 1 }
  },

  "POST /api/tax-filing-batches/:id/review": {
    reviewResult: { type: "string", enum: ["approved", "rejected"] },
    reviewNotes: { type: "string" }
  },

  "POST /api/tax-filing-batches/:id/submit": {
    authorizerUserId: { type: "string", min: 1 },
    authorizerName: { type: "string", min: 1 }
  },

  "POST /api/tax-filing-batches/:id/archive": {
    archiveLabel: { type: "string" },
    archiveNotes: { type: "string" },
    authorizerUserId: { type: "string", min: 1 },
    authorizerName: { type: "string", min: 1 }
  },

  "POST /api/taxpayer-profiles": {
    taxpayerType: {
      type: "string",
      required: true,
      enum: ["general_vat", "small_scale", "general_simplified"]
    },
    effectiveFrom: { type: "string", required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: "string", enum: ["active", "inactive"] },
    notes: { type: "string" }
  },

  "POST /api/tax/vat-settlement": {
    period: { type: "string", required: true, pattern: /^\d{4}-(0[1-9]|1[0-2])$/ }
  },

  "PUT /api/tax-items/:id": {
    status: { type: "string", enum: ["pending", "review_required", "ready"] },
    treatment: { type: "string" },
    basis: { type: "string" },
    filingPeriod: { type: "string" }
  },

  "PATCH /api/tax-integration/submissions/:id/confirm": {
    submissionRef: { type: "string" }
  }
};
