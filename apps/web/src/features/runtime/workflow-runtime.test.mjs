import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePayrollRuntimeSummary,
  derivePayrollTransferRuntimeSummary,
  deriveTaskRuntimeSummary,
  deriveTaxRuntimeSummary,
  deriveVoucherRuntimeSummary
} from "./workflow-runtime.ts";

test("deriveTaskRuntimeSummary marks blocked tasks as failed runtime", () => {
  const summary = deriveTaskRuntimeSummary([
    { id: "t1", status: "blocked" },
    { id: "t2", status: "in_review" }
  ], ["role-employee"]);
  assert.equal(summary.executionState, "failed");
  assert.equal(summary.authorizationState, "awaiting_authorization");
});

test("deriveTaxRuntimeSummary marks ready batch as authorized for tax specialist", () => {
  const summary = deriveTaxRuntimeSummary(
    [{ id: "i1", status: "ready" }],
    [{ id: "b1", status: "ready" }],
    { id: "b1", status: "ready", reviews: [], archives: [], items: [] },
    [{ status: "active" }],
    ["role-tax-specialist"]
  );
  assert.equal(summary.executionState, "running");
  assert.equal(summary.authorizationState, "authorized");
});

test("deriveVoucherRuntimeSummary marks review vouchers as awaiting authorization for employee", () => {
  const summary = deriveVoucherRuntimeSummary(
    [{ id: "v1", status: "review_required" }],
    {
      id: "v1",
      status: "review_required",
      lines: [
        { debit: 100, credit: 0, accountCode: "1001", accountName: "库存现金" },
        { debit: 0, credit: 100, accountCode: "6001", accountName: "主营业务收入" }
      ]
    },
    ["role-employee"]
  );
  assert.equal(summary.executionState, "running");
  assert.equal(summary.authorizationState, "awaiting_authorization");
});

test("derivePayrollRuntimeSummary marks confirmed payroll with pending ledgers as authorized for accountant", () => {
  const summary = derivePayrollRuntimeSummary(
    "2026-05",
    [{ id: "p1", status: "confirmed" }],
    "evt-1",
    [{ id: "l1", status: "pending" }],
    0,
    ["role-accountant"]
  );
  assert.equal(summary.executionState, "running");
  assert.equal(summary.authorizationState, "authorized");
});

test("derivePayrollTransferRuntimeSummary marks draft transfer batch as awaiting authorization for employee", () => {
  const summary = derivePayrollTransferRuntimeSummary(
    [{ id: "b1", status: "draft" }],
    { id: "b1", status: "draft" },
    ["role-employee"]
  );
  assert.equal(summary.executionState, "waiting");
  assert.equal(summary.authorizationState, "awaiting_authorization");
});
