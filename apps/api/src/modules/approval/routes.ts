/**
 * 审批流的 HTTP 接线（V13-A4/A6）。
 *
 * - `GET  /api/approval/flows`            流程列表
 * - `POST /api/approval/flows`            建流程（同类型旧流程自动停用）
 * - `GET  /api/approval/pending`          我的待办审批
 * - `POST /api/approval/instances`        提交审批
 * - `POST /api/approval/instances/:id/act` 批准 / 驳回 / 撤回
 * - `GET  /api/approval/instances/:id`    审批详情与历史
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { query } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import type { ApproverType } from "./engine.js";
import {
  act,
  createFlow,
  listActions,
  listFlows,
  listPendingFor,
  submitForApproval,
  type ApprovalDocumentType,
  type ApprovalFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<ApprovalFailureCode, number> = {
  FLOW_NOT_FOUND: 404,
  FLOW_NO_APPLICABLE_STEP: 400,
  INSTANCE_NOT_FOUND: 404,
  INSTANCE_ALREADY_PENDING: 409,
  NOT_AUTHORIZED: 403,
  INVALID_TRANSITION: 409
};

const DOCUMENT_TYPES: readonly ApprovalDocumentType[] = [
  "request",
  "advance",
  "reimbursement",
  "payment",
  "contract"
];
const APPROVER_TYPES: readonly ApproverType[] = ["role", "user", "manager"];

function asDocumentType(value: unknown): ApprovalDocumentType | null {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as ApprovalDocumentType)
    : null;
}

/**
 * 当前用户的直属下属。
 *
 * `manager` 类型的步骤要判「我是不是发起人的直属上级」，而组织架构不在
 * 审批模块里。这里按部门负责人取——与 FT 既有的部门模型一致，不另建汇报关系表。
 */
async function loadDirectReportUserIds(companyId: string, userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select u.id from users u
       join departments d on d.id = u.department_id
      where u.company_id = $1 and d.leader_user_id = $2 and u.id <> $2`,
    [companyId, userId]
  );
  return rows.map((row) => row.id);
}

export async function listFlowsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await listFlows(req.auth!.companyId);
  json(res, 200, { items, total: items.length });
}

export async function createFlowRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const documentType = asDocumentType(body.documentType);
  if (!documentType) {
    json(res, 400, { error: `documentType 必须是 ${DOCUMENT_TYPES.join(" / ")}` });
    return;
  }

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps = rawSteps.map((raw) => {
    const step = (raw ?? {}) as Record<string, unknown>;
    const approverType = APPROVER_TYPES.includes(step.approverType as ApproverType)
      ? (step.approverType as ApproverType)
      : "role";
    return {
      approverType,
      approverValue: typeof step.approverValue === "string" ? step.approverValue : "",
      minAmountCents: Number.isInteger(Number(step.minAmountCents))
        ? Number(step.minAmountCents)
        : 0
    };
  });

  // 门槛为空的步骤会让任何人都批不了、单据永久卡死。库上有 CHECK 兜底，
  // 但在这里拒能给出看得懂的话。
  const invalid = steps.find(
    (step) => step.approverType !== "manager" && step.approverValue.trim() === ""
  );
  if (invalid) {
    json(res, 400, { error: `${invalid.approverType} 类型的步骤必须指定审批人` });
    return;
  }

  const result = await createFlow({
    companyId: req.auth!.companyId,
    name: typeof body.name === "string" ? body.name.trim() : "",
    documentType,
    steps,
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "approval_flow.create",
    resourceType: "approval_flow",
    resourceId: result.value.id,
    resourceLabel: `${result.value.name}（${documentType}）`,
    // 流程变更是敏感操作：改了审批链等于改了谁能放行多大的钱。
    changes: { steps: result.value.steps.length, documentType }
  });

  json(res, 201, { flow: result.value });
}

export async function listPendingRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const { companyId, userId, roleCodes } = req.auth!;
  const items = await listPendingFor(companyId, {
    userId,
    roleCodes,
    directReportUserIds: await loadDirectReportUserIds(companyId, userId)
  });
  json(res, 200, { items, total: items.length });
}

export async function submitApprovalRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const documentType = asDocumentType(body.documentType);
  if (!documentType) {
    json(res, 400, { error: `documentType 必须是 ${DOCUMENT_TYPES.join(" / ")}` });
    return;
  }
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  if (documentId === "") {
    json(res, 400, { error: "documentId 不能为空" });
    return;
  }
  const amountCents = Number(body.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    json(res, 400, { error: "amountCents 必须是非负整数分" });
    return;
  }

  const result = await submitForApproval({
    companyId: req.auth!.companyId,
    documentType,
    documentId,
    submitterUserId: req.auth!.userId,
    amountCents,
    watcherUserIds: Array.isArray(body.watcherUserIds)
      ? body.watcherUserIds.filter((id): id is string => typeof id === "string")
      : []
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  json(res, 201, { instance: result.value });
}

export async function actOnApprovalRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "cancel") {
    json(res, 400, { error: "action 必须是 approve / reject / cancel" });
    return;
  }

  const { companyId, userId, roleCodes } = req.auth!;
  const result = await act({
    companyId,
    instanceId: id,
    actor: { userId, roleCodes },
    action,
    comment: typeof body.comment === "string" ? body.comment : null
    // manager 步骤的判权在 store 内部解析发起人的上级——路由层拿不到
    // submitterUserId，传当前用户 id 会让判据恒真、任何人都能批。
  });

  if (!result.ok) {
    json(res, STATUS_BY_FAILURE[result.failure.code], {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId,
    userId,
    action: `approval.${action}`,
    resourceType: "approval_instance",
    resourceId: id,
    resourceLabel: `${result.value.documentType} ${result.value.documentId}`,
    changes: { status: result.value.status, currentStepOrder: result.value.currentStepOrder }
  });

  json(res, 200, { instance: result.value });
}

export async function getApprovalDetailRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const actions = await listActions(id);
  json(res, 200, { actions, total: actions.length });
}
