import { randomBytes } from "node:crypto";
import type {
  BusinessEventStatus,
  ContractStatus,
  TaskStatus,
  TaxFilingBatchStatus,
  WorkflowMaterialReference,
  WorkflowResourceType,
  WorkflowState,
  WorkflowTransitionRecord
} from "@finance-taxation/domain-model";

const WORKFLOW_STATES = [
  "draft",
  "collecting_documents",
  "ready_for_review",
  "under_review",
  "awaiting_authorization",
  "executing",
  "completed",
  "blocked",
  "cancelled",
  "correcting"
] as const satisfies readonly WorkflowState[];

const TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  draft: ["collecting_documents", "ready_for_review", "under_review", "executing", "cancelled", "blocked"],
  collecting_documents: ["ready_for_review", "blocked", "cancelled", "correcting"],
  ready_for_review: ["under_review", "awaiting_authorization", "executing", "blocked", "correcting", "cancelled"],
  under_review: ["ready_for_review", "awaiting_authorization", "executing", "correcting", "blocked", "cancelled"],
  awaiting_authorization: ["executing", "correcting", "blocked", "cancelled"],
  executing: ["under_review", "completed", "blocked", "correcting", "cancelled"],
  completed: [],
  blocked: ["correcting", "cancelled", "awaiting_authorization", "executing"],
  cancelled: [],
  correcting: ["collecting_documents", "ready_for_review", "under_review", "cancelled", "blocked"]
};

export interface WorkflowTransitionValidationResult {
  ok: boolean;
  errorCode?: "WORKFLOW_INVALID_TRANSITION";
  message?: string;
}

export interface BuildWorkflowTransitionRecordInput {
  companyId: string;
  workflowRunId: string;
  resourceType: WorkflowResourceType;
  resourceId: string;
  previousState: WorkflowState;
  nextState: WorkflowState;
  actorUserId: string | null;
  actorName: string;
  basis: string;
  ruleVersion: string;
  relatedMaterials?: WorkflowMaterialReference[];
  occurredAt?: string;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export function listWorkflowStates(): readonly WorkflowState[] {
  return WORKFLOW_STATES;
}

export function canTransitionWorkflowState(
  previousState: WorkflowState,
  nextState: WorkflowState
): boolean {
  return TRANSITIONS[previousState].includes(nextState);
}

export function validateWorkflowTransition(
  previousState: WorkflowState,
  nextState: WorkflowState
): WorkflowTransitionValidationResult {
  if (previousState === nextState) {
    return { ok: true };
  }
  if (canTransitionWorkflowState(previousState, nextState)) {
    return { ok: true };
  }
  return {
    ok: false,
    errorCode: "WORKFLOW_INVALID_TRANSITION",
    message: `invalid workflow transition: ${previousState} -> ${nextState}`
  };
}

export function buildWorkflowTransitionRecord(
  input: BuildWorkflowTransitionRecordInput
): WorkflowTransitionRecord {
  return {
    id: nextId("wftr"),
    companyId: input.companyId,
    workflowRunId: input.workflowRunId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    previousState: input.previousState,
    nextState: input.nextState,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    basis: input.basis,
    ruleVersion: input.ruleVersion,
    relatedMaterials: input.relatedMaterials ?? [],
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
}

export function mapBusinessEventStatusToWorkflowState(status: BusinessEventStatus): WorkflowState {
  switch (status) {
    case "draft":
      return "draft";
    case "awaiting_documents":
      return "collecting_documents";
    case "analyzed":
      return "ready_for_review";
    case "awaiting_approval":
      return "awaiting_authorization";
    case "posted":
    case "archived":
      return "completed";
    case "blocked":
      return "blocked";
  }
}

export function mapContractStatusToWorkflowState(status: ContractStatus): WorkflowState {
  switch (status) {
    case "draft":
      return "draft";
    case "active":
      return "executing";
    case "fulfilled":
      return "completed";
    case "terminated":
      return "cancelled";
    case "expired":
      return "blocked";
  }
}

export function mapTaskStatusToWorkflowState(status: TaskStatus): WorkflowState {
  switch (status) {
    case "not_started":
      return "draft";
    case "in_progress":
      return "executing";
    case "in_review":
      return "under_review";
    case "done":
      return "completed";
    case "blocked":
      return "blocked";
    case "cancelled":
      return "cancelled";
  }
}

export function mapTaxFilingBatchStatusToWorkflowState(status: TaxFilingBatchStatus): WorkflowState {
  switch (status) {
    case "draft":
      return "draft";
    case "review_required":
      return "under_review";
    case "ready":
      return "ready_for_review";
    case "submitted":
      return "executing";
    case "archived":
      return "completed";
  }
}
