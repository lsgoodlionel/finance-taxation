import type { ObjectSchema } from "../../utils/validate.js";

/**
 * F9 request-body validation schemas for events / tasks / contracts /
 * counterparties routes.
 *
 * Only routes whose handler actually reads `req.body` are included here.
 * `required` is set only where the handler itself rejects the request
 * (400 / throw) when the field is missing — see each handler in
 * apps/api/src/modules/{events,tasks,contracts,counterparties}/routes.ts.
 *
 * Nullable fields (e.g. BusinessEvent.amount / contractId, which are
 * `string | null` in @finance-taxation/domain-model) are intentionally
 * omitted: FieldSpec has no nullable/union type, and a strict "string" type
 * would reject a legitimate `null` payload.
 *
 * Omitted on purpose (no body consumed by the handler at all):
 * - POST /api/events/:id/analyze — analyzeEvent never reads req.body.
 * - POST /api/events/:id/risk-check — runEventRiskCheck never reads req.body.
 * - POST /api/tasks/:id/remind — remindTask never reads req.body.
 */
export const eventsTasksBodySchemas: Record<string, ObjectSchema> = {
  "POST /api/events": {
    type: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    department: { type: "string" },
    occurredOn: { type: "string" },
    currency: { type: "string" },
    source: { type: "string" }
    // amount, contractId: nullable in CreateBusinessEventInput — omitted.
  },

  "PUT /api/events/:id": {
    title: { type: "string" },
    description: { type: "string" },
    department: { type: "string" },
    status: { type: "string" },
    occurredOn: { type: "string" }
    // amount: nullable in BusinessEvent — omitted.
  },

  "PUT /api/tasks/:id": {
    status: {
      type: "string",
      enum: ["not_started", "in_progress", "in_review", "done", "blocked", "cancelled"]
    },
    notes: { type: "string" }
  },

  "POST /api/contracts": {
    title: { type: "string", required: true, min: 1 },
    contractType: { type: "string", required: true, min: 1 },
    counterpartyName: { type: "string", required: true, min: 1 },
    contractNo: { type: "string" },
    counterpartyType: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    signedDate: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    status: { type: "string" },
    notes: { type: "string" }
  },

  "POST /api/contracts/:id/close": {
    status: { type: "string" },
    authorizerUserId: { type: "string" },
    authorizerName: { type: "string" }
  },

  "PUT /api/contracts/:id": {
    title: { type: "string" },
    counterpartyName: { type: "string" },
    counterpartyType: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    signedDate: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    status: { type: "string" },
    notes: { type: "string" }
  },

  "POST /api/counterparties": {
    name: { type: "string", required: true, min: 1 },
    category: { type: "string" },
    taxNo: { type: "string" },
    contactName: { type: "string" },
    contactPhone: { type: "string" },
    creditLimit: { type: "number" },
    creditDays: { type: "number", int: true },
    riskLevel: { type: "string" },
    notes: { type: "string" }
  },

  "PATCH /api/counterparties/:id": {
    // name is intentionally not accepted here: updateCounterparty's SQL
    // UPDATE clause never includes it, so it would be silently ignored.
    category: { type: "string" },
    taxNo: { type: "string" },
    contactName: { type: "string" },
    contactPhone: { type: "string" },
    creditLimit: { type: "number" },
    creditDays: { type: "number", int: true },
    riskLevel: { type: "string" },
    notes: { type: "string" }
  }
};
