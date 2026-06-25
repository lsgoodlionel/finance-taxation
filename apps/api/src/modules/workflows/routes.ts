import type { ServerResponse } from "node:http";
import { withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import {
  buildWorkflowCompensationRecord,
  canCancelWorkflowCommand,
  canRetryWorkflowCommand,
  markWorkflowCommandStatus
} from "./commands.js";
import {
  findWorkflowCommandExecution,
  getWorkflowCommandDetail,
  getWorkflowRunDetail,
  insertWorkflowCompensationRecord,
  listWorkflowCommandExecutions,
  listWorkflowRuns,
  updateWorkflowCommandExecution
} from "./persistence.js";

export function normalizeWorkflowFilters(url: URL) {
  return {
    resourceType: url.searchParams.get("resourceType"),
    resourceId: url.searchParams.get("resourceId"),
    state: url.searchParams.get("state"),
    workflowRunId: url.searchParams.get("workflowRunId"),
    status: url.searchParams.get("status")
  };
}

export async function listWorkflowRunsRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filters = normalizeWorkflowFilters(url);
  const items = await listWorkflowRuns(req.auth!.companyId, filters);
  return json(res, 200, { items, total: items.length });
}

export async function getWorkflowRunDetailRoute(req: ApiRequest, res: ServerResponse, runId: string) {
  const detail = await getWorkflowRunDetail(req.auth!.companyId, runId);
  if (!detail) {
    return json(res, 404, { error: "Workflow run not found" });
  }
  return json(res, 200, detail);
}

export async function listWorkflowCommandsRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filters = normalizeWorkflowFilters(url);
  const items = await listWorkflowCommandExecutions(req.auth!.companyId, filters);
  return json(res, 200, { items, total: items.length });
}

export async function getWorkflowCommandDetailRoute(req: ApiRequest, res: ServerResponse, commandId: string) {
  const detail = await getWorkflowCommandDetail(req.auth!.companyId, commandId);
  if (!detail) {
    return json(res, 404, { error: "Workflow command not found" });
  }
  return json(res, 200, detail);
}

export async function retryWorkflowCommandRoute(req: ApiRequest, res: ServerResponse, commandId: string) {
  const existing = await findWorkflowCommandExecution(req.auth!.companyId, commandId);
  if (!existing) {
    return json(res, 404, { error: "Workflow command not found" });
  }
  if (!canRetryWorkflowCommand(existing)) {
    return json(res, 400, { error: "Workflow command is not retryable" });
  }
  const updated = markWorkflowCommandStatus(existing, "waiting", {
    progress: "retry_queued",
    nextRetryAt: null,
    lastErrorCode: existing.lastErrorCode,
    lastErrorDetail: existing.lastErrorDetail
  });
  await withTransaction(async (client) => {
    await updateWorkflowCommandExecution(client, updated);
  });
  return json(res, 200, updated);
}

export async function cancelWorkflowCommandRoute(req: ApiRequest, res: ServerResponse, commandId: string) {
  const existing = await findWorkflowCommandExecution(req.auth!.companyId, commandId);
  if (!existing) {
    return json(res, 404, { error: "Workflow command not found" });
  }
  if (!canCancelWorkflowCommand(existing)) {
    return json(res, 400, { error: "Workflow command cannot be cancelled" });
  }
  const updated = markWorkflowCommandStatus(existing, "cancelled", {
    progress: "cancelled"
  });
  await withTransaction(async (client) => {
    await updateWorkflowCommandExecution(client, updated);
  });
  return json(res, 200, updated);
}

export async function createWorkflowCompensationRoute(req: ApiRequest, res: ServerResponse, commandId: string) {
  const existing = await findWorkflowCommandExecution(req.auth!.companyId, commandId);
  if (!existing) {
    return json(res, 404, { error: "Workflow command not found" });
  }
  const body = (req.body || {}) as { actionType?: string; reason?: string; handoffToUserId?: string; handoffToName?: string; notes?: string };
  if (!body.reason) {
    return json(res, 400, { error: "reason is required" });
  }
  const record = buildWorkflowCompensationRecord({
    companyId: req.auth!.companyId,
    workflowRunId: existing.workflowRunId,
    commandExecutionId: existing.id,
    actionType: body.actionType || "manual_takeover",
    reason: body.reason,
    handoffToUserId: body.handoffToUserId ?? null,
    handoffToName: body.handoffToName ?? null,
    notes: body.notes || ""
  });
  await withTransaction(async (client) => {
    await insertWorkflowCompensationRecord(client, record);
  });
  return json(res, 201, record);
}
