export interface WorkflowAuthorizationInput {
  action: string;
  requesterUserId?: string | null;
  approverUserId?: string | null;
  accountantUserId?: string | null;
  cashierUserId?: string | null;
  preparerUserId?: string | null;
  reviewerUserId?: string | null;
  posterUserId?: string | null;
  executorUserId?: string | null;
  authorizerUserId?: string | null;
}

export interface WorkflowAuthorizationResult {
  ok: boolean;
  errorCode?: "WORKFLOW_AUTHORIZATION_REQUIRED" | "WORKFLOW_DUTY_CONFLICT";
  message?: string;
}

const HIGH_RISK_ACTIONS = new Set([
  "tax.submit",
  "tax.archive",
  "voucher.post",
  "payroll.disburse",
  "bank.submit",
  "contract.close"
]);

export function isHighRiskWorkflowAction(action: string): boolean {
  return HIGH_RISK_ACTIONS.has(action);
}

export function validateWorkflowAuthorization(
  input: WorkflowAuthorizationInput
): WorkflowAuthorizationResult {
  if (input.requesterUserId && input.approverUserId && input.requesterUserId === input.approverUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "requester and approver must be different users"
    };
  }
  if (input.accountantUserId && input.cashierUserId && input.accountantUserId === input.cashierUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "accountant and cashier must be different users"
    };
  }
  if (input.preparerUserId && input.reviewerUserId && input.preparerUserId === input.reviewerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "preparer and reviewer must be different users"
    };
  }
  if (input.reviewerUserId && input.posterUserId && input.reviewerUserId === input.posterUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "reviewer and poster must be different users"
    };
  }
  if (input.executorUserId && input.authorizerUserId && input.executorUserId === input.authorizerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "executor and authorizer must be different users"
    };
  }
  if (isHighRiskWorkflowAction(input.action) && !input.authorizerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_AUTHORIZATION_REQUIRED",
      message: "high-risk workflow action requires a final authorizer"
    };
  }
  return { ok: true };
}
