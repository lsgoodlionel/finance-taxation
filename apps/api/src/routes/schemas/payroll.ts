/**
 * F9 request body validation schemas — payroll & employees routes.
 *
 * Keys are `"METHOD path"` (path exactly as declared in routes/registry.ts,
 * `:param` segments literal). Wiring these into `RouteDef.bodySchema` is out
 * of scope for this file — registry.ts is not touched here.
 *
 * Routes intentionally OMITTED (per assignment: multipart / URL-param-only
 * actions and array/object-only bodies are skipped entirely):
 *   - POST /api/payroll/:id/confirm
 *       confirmPayroll() never reads req.body — all state comes from the
 *       `:id` path param + req.auth.
 *   - POST /api/payroll/periods/:id/social-security-closure
 *       socialSecurityClosureRoute() never reads req.body — period comes
 *       from the `:id` path param.
 *   - PATCH /api/payroll/employees/salary-accounts
 *       updateSalaryAccounts() only reads `items` (an array of
 *       {employeeId, salaryAccount?, salaryBank?}); FieldSpec has no
 *       array/object support, so there is no scalar field left to validate.
 *   - POST /api/payroll/transfer/batches/:id/approve
 *       approveBatchRoute() never reads req.body.
 *   - POST /api/payroll/transfer/batches/:id/compensate
 *       compensateBatchRoute() never reads req.body.
 *   - POST /api/payroll/transfer/batches/:id/submit-api
 *       submitTransferApiRoute() never reads req.body — batch id from the
 *       path param drives everything.
 */

import type { ObjectSchema } from "../../utils/validate.js";

const PERIOD_PATTERN = /^\d{4}-\d{2}$/; // YYYY-MM, per payroll domain convention (see transfer.routes.ts)

export const payrollBodySchemas: Record<string, ObjectSchema> = {
  // createEmployee(): only `name` is required (handler 400s on falsy body.name);
  // all other fields fall back to "" / 0 / null when absent.
  "POST /api/employees": {
    name: { type: "string", required: true, min: 1 },
    idCard: { type: "string" },
    departmentId: { type: "string" },
    position: { type: "string" },
    hireDate: { type: "string" },
    baseSalary: { type: "number", min: 0 },
    notes: { type: "string" }
  },

  // updateEmployee(): every field is optional (falls back to the existing
  // row via `??`); nothing is required for the request to succeed.
  "PUT /api/employees/:id": {
    name: { type: "string", min: 1 },
    position: { type: "string" },
    baseSalary: { type: "number", min: 0 },
    hireDate: { type: "string" },
    leaveDate: { type: "string" },
    status: { type: "string", enum: ["active", "on_leave", "resigned"] },
    notes: { type: "string" }
  },

  // computePayroll(): 400s when body.period is falsy.
  "POST /api/payroll/compute": {
    period: { type: "string", required: true, pattern: PERIOD_PATTERN }
  },

  // syncPayrollReviewLedgers(): 400s when body.period is falsy.
  // `businessEventId` is deliberately omitted — the handler treats it as
  // nullable (`body.businessEventId ?? null`) and FieldSpec has no way to
  // allow `null` for a "string" field, so validating it would reject the
  // documented null case.
  "POST /api/payroll/review-ledgers": {
    period: { type: "string", required: true, pattern: PERIOD_PATTERN }
  },

  // updatePayrollPolicy(): every field is optional (falls back to the
  // existing row via `??`). Bounds reflect the domain (rates are 0–1
  // fractions, thresholds/bases are non-negative amounts) — consistent
  // with the min/max already used for money/rate fields elsewhere in
  // registry.ts's inline bodySchemas.
  "PUT /api/payroll/policy": {
    socialSecurityBaseMin: { type: "number", min: 0 },
    socialSecurityBaseMax: { type: "number", min: 0 },
    pensionEmployeeRate: { type: "number", min: 0, max: 1 },
    pensionEmployerRate: { type: "number", min: 0, max: 1 },
    medicalEmployeeRate: { type: "number", min: 0, max: 1 },
    medicalEmployerRate: { type: "number", min: 0, max: 1 },
    unemploymentEmployeeRate: { type: "number", min: 0, max: 1 },
    unemploymentEmployerRate: { type: "number", min: 0, max: 1 },
    housingFundEmployeeRate: { type: "number", min: 0, max: 1 },
    housingFundEmployerRate: { type: "number", min: 0, max: 1 },
    iitThreshold: { type: "number", min: 0 }
  },

  // buildBatchRoute(): 400s when body.period is missing or fails
  // /^\d{4}-\d{2}$/ (checked verbatim in the handler); bankAccountId is
  // optional and only used as a passthrough hint.
  "POST /api/payroll/transfer/batches": {
    period: { type: "string", required: true, pattern: PERIOD_PATTERN },
    bankAccountId: { type: "string" }
  },

  // disburseBatchRoute(): all three fields are optional — bankTransferRef
  // passes through to markDisbursed(), authorizerUserId/authorizerName
  // default to the requesting user when absent.
  "POST /api/payroll/transfer/batches/:id/disburse": {
    bankTransferRef: { type: "string" },
    authorizerUserId: { type: "string" },
    authorizerName: { type: "string" }
  }
};
