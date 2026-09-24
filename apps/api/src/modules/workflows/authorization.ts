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
      message: "申请人和审批人不能是同一个人。请交给有审批权限的同事处理。"
    };
  }
  if (input.accountantUserId && input.cashierUserId && input.accountantUserId === input.cashierUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "记账人和付款人不能是同一个人——管账与管钱必须分开。"
    };
  }
  if (input.preparerUserId && input.reviewerUserId && input.preparerUserId === input.reviewerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "制单人和复核人不能是同一个人。请让同事复核这张单据。"
    };
  }
  if (input.reviewerUserId && input.posterUserId && input.reviewerUserId === input.posterUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "复核人和过账人不能是同一个人。这张凭证由谁复核的，就得换个人过账。"
    };
  }
  if (input.executorUserId && input.authorizerUserId && input.executorUserId === input.authorizerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_DUTY_CONFLICT",
      message: "执行人和终审人不能是同一个人。请选择另一位有权限的同事作为终审人。"
    };
  }
  if (isHighRiskWorkflowAction(input.action) && !input.authorizerUserId) {
    return {
      ok: false,
      errorCode: "WORKFLOW_AUTHORIZATION_REQUIRED",
      message: "这是高风险操作，必须指定终审人。"
    };
  }
  return { ok: true };
}
