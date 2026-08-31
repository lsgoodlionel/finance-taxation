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
  // type / title / occurredOn 在 business_events 上是 NOT NULL 且无默认值：
  // 不标 required 时缺字段会一路打到数据库约束，用户拿到的是 500 而非 400。
  // 其余 NOT NULL 但有默认值的列（description/department/source）由 handler 兜底。
  "POST /api/events": {
    type: { type: "string", required: true, min: 1, max: 60 },
    title: { type: "string", required: true, min: 1, max: 200 },
    description: { type: "string" },
    department: { type: "string" },
    occurredOn: { type: "string", required: true, min: 1, max: 40 },
    currency: { type: "string" },
    source: { type: "string" },
    /**
     * 应税行为类别（税目口径，V17 阶段二）。
     *
     * 可选：不填就回退到公司主营类别；公司也没配就报「税目待确认」，不猜。
     * 值域由 `tax/taxable-category.ts` 的 TaxableCategory 定义，
     * 这里只做长度约束——枚举校验放在 handler 里，
     * 因为值域随政策走，写死在两处迟早漂移。
     */
    taxableCategory: { type: "string", max: 40 }
    // amount, contractId: nullable in CreateBusinessEventInput — omitted.
  },

  "PUT /api/events/:id": {
    title: { type: "string" },
    description: { type: "string" },
    department: { type: "string" },
    status: { type: "string" },
    occurredOn: { type: "string" },
    /**
     * 应税行为类别。标错了要能改——事项一旦建好就可能已经派生了税项与凭证，
     * 重建一笔的代价远大于改一个字段，而用户面对「只能重建」的实际做法
     * 是将错就错，于是那笔业务一直按错的税率算下去。
     */
    taxableCategory: { type: "string", max: 40 }
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
