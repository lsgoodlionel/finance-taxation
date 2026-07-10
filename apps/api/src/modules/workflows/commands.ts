import { randomBytes } from "node:crypto";
import type {
  WorkflowCommandExecution,
  WorkflowCommandStatus,
  WorkflowCompensationRecord,
  WorkflowResourceType,
  WorkflowRetryPolicy,
  WorkflowRun,
  WorkflowState,
  WorkflowTimeoutPolicy
} from "@finance-taxation/domain-model";

const COMMAND_STATUS_TRANSITIONS: Record<WorkflowCommandStatus, readonly WorkflowCommandStatus[]> = {
  waiting: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["waiting", "cancelled"],
  cancelled: []
};

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export interface BuildWorkflowRunInput {
  companyId: string;
  workflowKey: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  resourceLabel: string;
  currentState: WorkflowState;
  initiatorUserId?: string | null;
  initiatorName?: string;
  authorizerUserId?: string | null;
  authorizerName?: string | null;
  blockedReason?: string | null;
  createdAt?: string;
}

export interface BuildWorkflowCommandInput {
  companyId: string;
  workflowRunId: string;
  commandType: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  idempotencyKey: string;
  objectVersion: string;
  progress?: string;
  inputSnapshot?: Record<string, unknown>;
  retryPolicy?: Partial<WorkflowRetryPolicy>;
  timeoutPolicy?: Partial<WorkflowTimeoutPolicy>;
  executorUserId?: string | null;
  executorName?: string;
  initiatorUserId?: string | null;
  initiatorName?: string;
  authorizerUserId?: string | null;
  authorizerName?: string | null;
  createdAt?: string;
}

export interface BuildWorkflowCompensationInput {
  companyId: string;
  workflowRunId: string;
  commandExecutionId: string;
  actionType: string;
  reason: string;
  handoffToUserId?: string | null;
  handoffToName?: string | null;
  notes?: string;
  createdAt?: string;
}

export function buildWorkflowRun(input: BuildWorkflowRunInput): WorkflowRun {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: nextId("wfr"),
    companyId: input.companyId,
    workflowKey: input.workflowKey,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceLabel: input.resourceLabel,
    currentState: input.currentState,
    initiatorUserId: input.initiatorUserId ?? null,
    initiatorName: input.initiatorName ?? "",
    authorizerUserId: input.authorizerUserId ?? null,
    authorizerName: input.authorizerName ?? null,
    blockedReason: input.blockedReason ?? null,
    createdAt: now,
    updatedAt: now
  };
}

export function canTransitionWorkflowCommandStatus(
  previousStatus: WorkflowCommandStatus,
  nextStatus: WorkflowCommandStatus
): boolean {
  return COMMAND_STATUS_TRANSITIONS[previousStatus].includes(nextStatus);
}

export function buildWorkflowCommandExecution(
  input: BuildWorkflowCommandInput
): WorkflowCommandExecution {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: nextId("wfc"),
    companyId: input.companyId,
    workflowRunId: input.workflowRunId,
    commandType: input.commandType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    idempotencyKey: input.idempotencyKey,
    objectVersion: input.objectVersion,
    status: "waiting",
    progress: input.progress ?? "queued",
    inputSnapshot: input.inputSnapshot ?? {},
    resultSnapshot: null,
    retryPolicy: {
      maxAttempts: input.retryPolicy?.maxAttempts ?? 1,
      backoffMinutes: input.retryPolicy?.backoffMinutes ?? 0
    },
    timeoutPolicy: {
      timeoutSeconds: input.timeoutPolicy?.timeoutSeconds ?? 300
    },
    attemptCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorDetail: null,
    executorUserId: input.executorUserId ?? null,
    executorName: input.executorName ?? "",
    initiatorUserId: input.initiatorUserId ?? null,
    initiatorName: input.initiatorName ?? "",
    authorizerUserId: input.authorizerUserId ?? null,
    authorizerName: input.authorizerName ?? null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null
  };
}

export function findReusableWorkflowCommand(
  existing: WorkflowCommandExecution[],
  input: Pick<BuildWorkflowCommandInput, "commandType" | "resourceType" | "resourceId" | "idempotencyKey" | "objectVersion">
): WorkflowCommandExecution | null {
  return existing.find((item) =>
    item.commandType === input.commandType &&
    item.resourceType === input.resourceType &&
    item.resourceId === input.resourceId &&
    item.idempotencyKey === input.idempotencyKey &&
    item.objectVersion === input.objectVersion &&
    item.status === "succeeded"
  ) ?? null;
}

export function markWorkflowCommandStatus(
  execution: WorkflowCommandExecution,
  nextStatus: WorkflowCommandStatus,
  options: {
    progress?: string;
    resultSnapshot?: Record<string, unknown> | null;
    lastErrorCode?: string | null;
    lastErrorDetail?: string | null;
    nextRetryAt?: string | null;
    updatedAt?: string;
  } = {}
): WorkflowCommandExecution {
  if (execution.status !== nextStatus && !canTransitionWorkflowCommandStatus(execution.status, nextStatus)) {
    throw new Error(`invalid command status transition: ${execution.status} -> ${nextStatus}`);
  }
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const attemptCount = nextStatus === "running" ? execution.attemptCount + 1 : execution.attemptCount;
  return {
    ...execution,
    status: nextStatus,
    progress: options.progress ?? execution.progress,
    resultSnapshot: options.resultSnapshot === undefined ? execution.resultSnapshot : options.resultSnapshot,
    lastErrorCode: options.lastErrorCode === undefined ? execution.lastErrorCode : options.lastErrorCode,
    lastErrorDetail: options.lastErrorDetail === undefined ? execution.lastErrorDetail : options.lastErrorDetail,
    nextRetryAt: options.nextRetryAt === undefined ? execution.nextRetryAt : options.nextRetryAt,
    attemptCount,
    updatedAt,
    finishedAt: nextStatus === "succeeded" || nextStatus === "failed" || nextStatus === "cancelled"
      ? updatedAt
      : execution.finishedAt
  };
}

export function canRetryWorkflowCommand(execution: WorkflowCommandExecution): boolean {
  return execution.status === "failed" && execution.attemptCount < execution.retryPolicy.maxAttempts;
}

export function canCancelWorkflowCommand(execution: WorkflowCommandExecution): boolean {
  return execution.status === "waiting" || execution.status === "running";
}

export function buildWorkflowCompensationRecord(
  input: BuildWorkflowCompensationInput
): WorkflowCompensationRecord {
  return {
    id: nextId("wfcomp"),
    companyId: input.companyId,
    workflowRunId: input.workflowRunId,
    commandExecutionId: input.commandExecutionId,
    actionType: input.actionType,
    status: "open",
    reason: input.reason,
    handoffToUserId: input.handoffToUserId ?? null,
    handoffToName: input.handoffToName ?? null,
    notes: input.notes ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    resolvedAt: null
  };
}
