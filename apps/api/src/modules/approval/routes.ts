/**
 * 审批流的 HTTP 接线（V13-A4/A6）。
 *
 * - `GET  /api/approval/flows`            流程列表
 * - `POST /api/approval/flows`            建流程（同类型旧流程自动停用）
 * - `GET  /api/approval/pending`          我的待办审批
 * - `POST /api/approval/instances`        提交审批
 * - `POST /api/approval/instances/:id/act` 批准 / 驳回 / 撤回
 * - `GET  /api/approval/instances/:id`    审批详情与历史
 * - `GET  /api/approval/watched`          抄送给我的（V13 残留 4）
 * - `POST /api/approval/watched/:id/read` 标记已读
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
  addParticipant,
  listParticipants,
  listPendingFor,
  listWatchedBy,
  markWatchRead,
  submitForApproval,
  type ApprovalDocumentType,
  type ApprovalFailureCode
} from "./store.js";
import type { StepMode } from "./engine.js";

const STATUS_BY_FAILURE: Record<ApprovalFailureCode, number> = {
  FLOW_NOT_FOUND: 404,
  FLOW_NO_APPLICABLE_STEP: 400,
  FLOW_STEP_HAS_NO_APPROVER: 400,
  INSTANCE_NOT_FOUND: 404,
  INSTANCE_ALREADY_PENDING: 409,
  NOT_AUTHORIZED: 403,
  INVALID_TRANSITION: 409,
  PARTICIPANT_ALREADY_ACTED: 409
};

const STEP_MODES: readonly StepMode[] = ["all", "any"];

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

    // V14-B：审批人从一个变成一组。**旧的单审批人格式仍然接受**——
    // 已有的前端与脚本还在用它，一次改完两边不现实，而把单个包成
    // 只有一项的数组，语义完全一致（一个人时会签与或签行为相同）。
    const rawApprovers = Array.isArray(step.approvers)
      ? step.approvers
      : [{ approverType: step.approverType, approverValue: step.approverValue }];

    return {
      mode: STEP_MODES.includes(step.mode as StepMode) ? (step.mode as StepMode) : "all",
      minAmountCents: Number.isInteger(Number(step.minAmountCents))
        ? Number(step.minAmountCents)
        : 0,
      approvers: rawApprovers.map((rawApprover) => {
        const approver = (rawApprover ?? {}) as Record<string, unknown>;
        return {
          approverType: APPROVER_TYPES.includes(approver.approverType as ApproverType)
            ? (approver.approverType as ApproverType)
            : "role",
          approverValue:
            typeof approver.approverValue === "string" ? approver.approverValue : ""
        };
      })
    };
  });

  // 审批人为空的步骤会让任何人都批不了、单据永久卡死。库上有 CHECK 兜底，
  // 但在这里拒能给出看得懂的话。
  for (const [index, step] of steps.entries()) {
    if (step.approvers.length === 0) {
      json(res, 400, { error: `第 ${index + 1} 步没有指定审批人` });
      return;
    }
    const invalid = step.approvers.find(
      (approver) => approver.approverType !== "manager" && approver.approverValue.trim() === ""
    );
    if (invalid) {
      json(res, 400, {
        error: `第 ${index + 1} 步的 ${invalid.approverType} 类型审批人必须指定具体对象`
      });
      return;
    }
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
  const [actions, participants] = await Promise.all([listActions(id), listParticipants(id)]);
  // V14-B：参与人一并返回。会签下「谁批了、还差谁」是详情页最重要的一屏——
  // 只给动作历史的话，「还差谁」要用户自己拿流程定义去减，那不是他的活。
  json(res, 200, { actions, participants, total: actions.length });
}

/**
 * 动态加签（V14-B）。
 *
 * 权限门是 `workflow.view`（能看审批就能操作自己那一步），真正的判权收敛在
 * `addParticipant` 里：**只有当前步骤的参与人能加签**。加签的语义是「这事我
 * 拿不准，得让 X 也看看」，说这句话的人必须是正在处理这一步的人——任何人
 * 都能加签的话，加签就成了往别人流程里塞人的工具。
 */
export async function addParticipantRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (targetUserId === "") {
    json(res, 400, { error: "userId 不能为空" });
    return;
  }

  const result = await addParticipant({
    companyId: req.auth!.companyId,
    instanceId: id,
    targetUserId,
    actorUserId: req.auth!.userId
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
    action: "approval.add_participant",
    resourceType: "approval_instance",
    resourceId: id,
    resourceLabel: `加签 ${targetUserId}`,
    changes: { targetUserId }
  });

  json(res, 200, { participants: result.value });
}

/**
 * 抄送给我的审批（V13 残留 4）。
 *
 * 与待办不同：**已结束的也返回**。待办只看 pending（没结束的才要处理），
 * 而抄送是「知会」——一张单批完了、被驳回了，抄送人同样该看到结果。
 */
export async function listWatchedRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await listWatchedBy(req.auth!.companyId, req.auth!.userId);
  json(res, 200, {
    items,
    total: items.length,
    // 未读数单独给：界面上要在入口挂角标，不然抄送来了没人知道。
    unread: items.filter((item) => item.readAt === null).length
  });
}

export async function markWatchedReadRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  // 只能标记自己的抄送——userId 固定取 req.auth，不接受传入。
  await markWatchRead(id, req.auth!.userId);
  json(res, 200, { ok: true });
}
