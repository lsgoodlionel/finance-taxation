import test from "node:test";
import assert from "node:assert/strict";
import {
  isHighRiskWorkflowAction,
  validateWorkflowAuthorization
} from "./authorization.js";

test("high-risk actions require a final authorizer", () => {
  assert.equal(isHighRiskWorkflowAction("tax.submit"), true);
  const result = validateWorkflowAuthorization({
    action: "tax.submit",
    requesterUserId: "u-1",
    executorUserId: "u-2"
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "WORKFLOW_AUTHORIZATION_REQUIRED");
});

test("requester and approver cannot be the same user", () => {
  const result = validateWorkflowAuthorization({
    action: "expense.approve",
    requesterUserId: "u-1",
    approverUserId: "u-1"
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "WORKFLOW_DUTY_CONFLICT");
});

test("reviewer and poster cannot be the same user", () => {
  const result = validateWorkflowAuthorization({
    action: "voucher.post",
    reviewerUserId: "u-2",
    posterUserId: "u-2",
    authorizerUserId: "u-3"
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "WORKFLOW_DUTY_CONFLICT");
});

test("separate users pass authorization checks", () => {
  const result = validateWorkflowAuthorization({
    action: "contract.close",
    requesterUserId: "u-1",
    approverUserId: "u-2",
    executorUserId: "u-3",
    authorizerUserId: "u-4"
  });
  assert.equal(result.ok, true);
});
