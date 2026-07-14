/**
 * F9: request body validation schemas for a batch of mutating routes that
 * don't yet have one. Keyed by "METHOD path" (path template, not the
 * resolved URL) to match the shape of the route registry.
 *
 * Scope (see docs/v6-upgrade-blueprint-and-parallel-plan.md, F9):
 *   POST /api/rnd/projects
 *   POST /api/rnd/projects/:id/cost-lines
 *   POST /api/rnd/projects/:id/time-entries
 *   POST /api/knowledge
 *   PUT  /api/knowledge/:id
 *   POST /api/feedback
 *   POST /api/proposals/:id/decide
 *   POST /api/exports/jobs
 *   POST /api/exports/jobs/:id/status
 *   POST /api/billing/subscribe
 *   POST /api/risk/findings/:id/close
 *
 * Intentionally omitted (see per-route rationale in the review notes):
 *   POST /api/feedback/consolidate       — reads no body fields at all
 *   POST /api/billing/payments/:id/confirm — body is a single optional field
 *   POST /api/knowledge/parse-documents  — multipart, out of scope for this schema
 */
import type { ObjectSchema } from "../../utils/validate.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const rndMiscBodySchemas: Record<string, ObjectSchema> = {
  // createRndProject (apps/api/src/modules/rnd/routes.ts): every field falls
  // back to a default when absent, so nothing is required — only type/shape
  // constraints apply to whatever is actually sent.
  "POST /api/rnd/projects": {
    businessEventId: { type: "string" },
    code: { type: "string", min: 1, max: 64 },
    name: { type: "string", min: 1, max: 200 },
    status: { type: "string", enum: ["planning", "active", "closed"] },
    capitalizationPolicy: { type: "string", enum: ["expense", "capitalize", "mixed"] },
    startedOn: { type: "string", pattern: ISO_DATE },
    endedOn: { type: "string", pattern: ISO_DATE },
    notes: { type: "string", max: 2000 }
  },

  // createRndCostLine → normalizeRndCostLineInput (apps/api/src/modules/rnd/inputs.ts):
  // amount defaults to 0 then normalizeMoney() throws unless > 0, and
  // occurredOn defaults to "" then fails the date-format check — both are
  // effectively required. costType/accountingTreatment fall back silently.
  "POST /api/rnd/projects/:id/cost-lines": {
    amount: { type: "number", required: true, min: 0.01 },
    occurredOn: { type: "string", required: true, pattern: ISO_DATE },
    costType: {
      type: "string",
      enum: ["payroll", "materials", "service", "software", "equipment", "other"]
    },
    accountingTreatment: { type: "string", enum: ["expensed", "capitalized"] },
    businessEventId: { type: "string" },
    voucherId: { type: "string" },
    notes: { type: "string", max: 2000 }
  },

  // createRndTimeEntry → normalizeRndTimeEntryInput: staffName throws when
  // blank, workDate/hours fail the same way as occurredOn/amount above.
  "POST /api/rnd/projects/:id/time-entries": {
    staffName: { type: "string", required: true, min: 1, max: 100 },
    workDate: { type: "string", required: true, pattern: ISO_DATE },
    hours: { type: "number", required: true, min: 0.01 },
    businessEventId: { type: "string" },
    userId: { type: "string" },
    notes: { type: "string", max: 2000 }
  },

  // createKnowledgeItem: handler 400s when category/title/content are missing,
  // and 400s again if category isn't one of the four known values. `tags` is
  // an array — unsupported by FieldSpec — so it's left unvalidated here.
  "POST /api/knowledge": {
    category: { type: "string", required: true, enum: ["regulation", "policy", "faq", "template"] },
    title: { type: "string", required: true, min: 1, max: 200 },
    content: { type: "string", required: true, min: 1 }
  },

  // updateKnowledgeItem: every field is optional (partial update; a request
  // with none of them is a no-op, not a 400). `category` isn't re-validated
  // by the handler on update, but the enum is kept aligned with create's set
  // since any other value would be a dead-end taxonomy entry. `tags` omitted
  // for the same array-type reason as above.
  "PUT /api/knowledge/:id": {
    category: { type: "string", enum: ["regulation", "policy", "faq", "template"] },
    title: { type: "string", min: 1, max: 200 },
    content: { type: "string", min: 1 },
    isActive: { type: "boolean" }
  },

  // submitFeedback: title is required (400 when blank); category is
  // coerced to "suggestion" when absent/invalid rather than rejected, so
  // it's validated but not required.
  "POST /api/feedback": {
    title: { type: "string", required: true, min: 1, max: 200 },
    category: { type: "string", enum: ["bug", "suggestion", "question"] },
    content: { type: "string", max: 5000 },
    module: { type: "string", max: 100 }
  },

  // decideProposal: decision must be one of VALID_DECISIONS or the handler
  // 400s; note is appended as-is with an empty-string fallback.
  "POST /api/proposals/:id/decide": {
    decision: { type: "string", required: true, enum: ["approved", "rejected", "in_development", "done"] },
    note: { type: "string", max: 2000 }
  },

  // createExportJob: kind/label/fileName all 400 when missing; the other
  // identifiers are nullable pass-through strings, and status defaults to
  // "created" when absent.
  "POST /api/exports/jobs": {
    kind: {
      type: "string",
      required: true,
      enum: ["payroll", "report", "tax", "package", "document", "risk", "rnd", "voucher"]
    },
    label: { type: "string", required: true, min: 1, max: 200 },
    fileName: { type: "string", required: true, min: 1, max: 260 },
    resourceType: { type: "string", max: 100 },
    resourceId: { type: "string", max: 100 },
    periodLabel: { type: "string", max: 100 },
    status: { type: "string", enum: ["created", "opened", "completed", "failed"] }
  },

  // updateExportJobStatus: status must be opened/completed/failed or the
  // handler 400s (note: "created" is a valid job status but not a valid
  // target for this transition endpoint). errorMessage/nextRetryAt are
  // optional overrides used only on the "failed" branch.
  "POST /api/exports/jobs/:id/status": {
    status: { type: "string", required: true, enum: ["opened", "completed", "failed"] },
    errorMessage: { type: "string", max: 2000 },
    nextRetryAt: { type: "string" }
  },

  // subscribePlan: planCode is required (400 when missing); billingCycle
  // falls back to "monthly" for any non-"yearly" value rather than
  // rejecting, so it's validated but not required.
  "POST /api/billing/subscribe": {
    planCode: { type: "string", required: true, min: 1 },
    billingCycle: { type: "string", enum: ["monthly", "yearly"] },
    method: { type: "string", max: 50 }
  },

  // closeRiskFinding: resolution is trimmed and 400s when empty.
  "POST /api/risk/findings/:id/close": {
    resolution: { type: "string", required: true, min: 1, max: 2000 }
  }
};
