import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowTransitionRecord,
  canTransitionWorkflowState,
  mapBusinessEventStatusToWorkflowState,
  mapContractStatusToWorkflowState,
  mapPayrollTransferBatchStatusToWorkflowState,
  mapVoucherStatusToWorkflowState,
  validateWorkflowTransition
} from "./runtime.js";

test("workflow runtime allows linear review progression", () => {
  assert.equal(canTransitionWorkflowState("draft", "ready_for_review"), true);
  assert.equal(canTransitionWorkflowState("ready_for_review", "under_review"), true);
  assert.equal(canTransitionWorkflowState("under_review", "awaiting_authorization"), true);
  assert.equal(canTransitionWorkflowState("awaiting_authorization", "executing"), true);
  assert.equal(canTransitionWorkflowState("executing", "completed"), true);
});

test("workflow runtime rejects invalid direct terminal jump", () => {
  const result = validateWorkflowTransition("draft", "completed");
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "WORKFLOW_INVALID_TRANSITION");
});

test("workflow runtime supports correction loop", () => {
  assert.equal(canTransitionWorkflowState("under_review", "correcting"), true);
  assert.equal(canTransitionWorkflowState("correcting", "collecting_documents"), true);
});

test("workflow runtime builds transition records", () => {
  const record = buildWorkflowTransitionRecord({
    companyId: "cmp-1",
    workflowRunId: "run-1",
    resourceType: "business_event",
    resourceId: "evt-1",
    previousState: "ready_for_review",
    nextState: "under_review",
    actorUserId: "u-1",
    actorName: "finance",
    basis: "提交复核",
    ruleVersion: "v4-1a"
  });
  assert.equal(record.workflowRunId, "run-1");
  assert.equal(record.nextState, "under_review");
});

test("legacy object status adapters map to workflow states", () => {
  assert.equal(mapBusinessEventStatusToWorkflowState("awaiting_documents"), "collecting_documents");
  assert.equal(mapBusinessEventStatusToWorkflowState("awaiting_approval"), "awaiting_authorization");
  assert.equal(mapContractStatusToWorkflowState("active"), "executing");
  assert.equal(mapContractStatusToWorkflowState("fulfilled"), "completed");
  assert.equal(mapVoucherStatusToWorkflowState("review_required"), "under_review");
  assert.equal(mapPayrollTransferBatchStatusToWorkflowState("approved"), "awaiting_authorization");
});
