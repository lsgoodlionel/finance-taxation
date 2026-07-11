import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePayrollPeriodFromEvent,
  normalizeDrilldownState,
  resolveAuditContextFromState
} from "./drilldown.ts";

test("normalizeDrilldownState keeps supported ids and context keys", () => {
  const state = normalizeDrilldownState({
    businessEventId: "evt-1",
    contractId: "ctr-1",
    voucherId: "vch-1",
    taxItemId: "tax-1",
    payrollPeriod: "2026-05",
    tab: "payroll",
    focus: "runtime",
    resourceType: "payroll",
    resourceId: "batch-1",
    ignored: 123
  });

  assert.deepEqual(state, {
    businessEventId: "evt-1",
    contractId: "ctr-1",
    documentId: undefined,
    voucherId: "vch-1",
    taxItemId: "tax-1",
    riskFindingId: undefined,
    employeeId: undefined,
    payrollPeriod: "2026-05",
    tab: "payroll",
    scene: undefined,
    focus: "runtime",
    riskScope: undefined,
    resourceType: "payroll",
    resourceId: "batch-1"
  });
});

test("resolveAuditContextFromState prefers explicit resource context", () => {
  const context = resolveAuditContextFromState({
    resourceType: "payroll",
    resourceId: "batch-1",
    businessEventId: "evt-1",
    voucherId: "vch-1"
  });

  assert.deepEqual(context, {
    resourceType: "payroll",
    resourceId: "batch-1"
  });
});

test("resolveAuditContextFromState falls back by business object priority", () => {
  assert.deepEqual(resolveAuditContextFromState({ taxItemId: "tax-1", voucherId: "vch-1" }), {
    resourceType: "tax_item",
    resourceId: "tax-1"
  });
  assert.deepEqual(resolveAuditContextFromState({ voucherId: "vch-1", contractId: "ctr-1" }), {
    resourceType: "voucher",
    resourceId: "vch-1"
  });
  assert.deepEqual(resolveAuditContextFromState({ contractId: "ctr-1", businessEventId: "evt-1" }), {
    resourceType: "contract",
    resourceId: "ctr-1"
  });
});

test("derivePayrollPeriodFromEvent only accepts payroll events with ISO date", () => {
  assert.equal(
    derivePayrollPeriodFromEvent({ type: "payroll", occurredOn: "2026-05-15" }),
    "2026-05"
  );
  assert.equal(
    derivePayrollPeriodFromEvent({ type: "payroll", occurredOn: "2026/05/15" }),
    null
  );
  assert.equal(
    derivePayrollPeriodFromEvent({ type: "expense", occurredOn: "2026-05-15" }),
    null
  );
});
