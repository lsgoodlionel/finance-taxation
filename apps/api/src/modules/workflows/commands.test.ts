import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowCommandExecution,
  buildWorkflowCompensationRecord,
  buildWorkflowRun,
  canCancelWorkflowCommand,
  canRetryWorkflowCommand,
  findReusableWorkflowCommand,
  markWorkflowCommandStatus
} from "./commands.js";

test("workflow commands default to waiting and can start running", () => {
  const run = buildWorkflowRun({
    companyId: "cmp-1",
    workflowKey: "tax-submit",
    resourceType: "tax_filing_batch",
    resourceId: "batch-1",
    resourceLabel: "增值税 2026-05",
    currentState: "awaiting_authorization"
  });
  const command = buildWorkflowCommandExecution({
    companyId: "cmp-1",
    workflowRunId: run.id,
    commandType: "tax.submit",
    resourceType: "tax_filing_batch",
    resourceId: "batch-1",
    idempotencyKey: "submit:batch-1:v1",
    objectVersion: "v1"
  });
  assert.equal(command.status, "waiting");
  const running = markWorkflowCommandStatus(command, "running", { progress: "submitting" });
  assert.equal(running.status, "running");
  assert.equal(running.attemptCount, 1);
});

test("successful command is reusable by idempotency key and object version", () => {
  const command = buildWorkflowCommandExecution({
    companyId: "cmp-1",
    workflowRunId: "run-1",
    commandType: "tax.submit",
    resourceType: "tax_filing_batch",
    resourceId: "batch-1",
    idempotencyKey: "submit:batch-1:v1",
    objectVersion: "v1"
  });
  const succeeded = markWorkflowCommandStatus(
    markWorkflowCommandStatus(command, "running"),
    "succeeded",
    { resultSnapshot: { receiptNo: "ok-1" } }
  );
  const reused = findReusableWorkflowCommand([succeeded], {
    commandType: "tax.submit",
    resourceType: "tax_filing_batch",
    resourceId: "batch-1",
    idempotencyKey: "submit:batch-1:v1",
    objectVersion: "v1"
  });
  assert.equal(reused?.id, succeeded.id);
});

test("failed command remains retryable before max attempts", () => {
  const command = buildWorkflowCommandExecution({
    companyId: "cmp-1",
    workflowRunId: "run-1",
    commandType: "bank.submit",
    resourceType: "generic",
    resourceId: "job-1",
    idempotencyKey: "bank:job-1:v1",
    objectVersion: "v1",
    retryPolicy: { maxAttempts: 2, backoffMinutes: 10 }
  });
  const failed = markWorkflowCommandStatus(
    markWorkflowCommandStatus(command, "running"),
    "failed",
    { lastErrorCode: "BANK_TIMEOUT", nextRetryAt: "2026-06-24T10:00:00.000Z" }
  );
  assert.equal(canRetryWorkflowCommand(failed), true);
  assert.equal(canCancelWorkflowCommand(failed), false);
});

test("compensation records capture manual takeover handoff", () => {
  const record = buildWorkflowCompensationRecord({
    companyId: "cmp-1",
    workflowRunId: "run-1",
    commandExecutionId: "cmd-1",
    actionType: "manual_takeover",
    reason: "资料缺失",
    handoffToUserId: "u-9",
    handoffToName: "tax-manager"
  });
  assert.equal(record.status, "open");
  assert.equal(record.handoffToUserId, "u-9");
});
