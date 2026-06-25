import type { PoolClient } from "pg";
import type {
  WorkflowCommandExecution,
  WorkflowCompensationRecord,
  WorkflowRun,
  WorkflowTransitionRecord
} from "@finance-taxation/domain-model";
import { query, queryOne } from "../../db/client.js";

interface WorkflowRunRow {
  id: string;
  company_id: string;
  workflow_key: string;
  resource_type: WorkflowRun["resourceType"];
  resource_id: string;
  resource_label: string;
  current_state: WorkflowRun["currentState"];
  initiator_user_id: string | null;
  initiator_name: string;
  authorizer_user_id: string | null;
  authorizer_name: string | null;
  blocked_reason: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface WorkflowTransitionRow {
  id: string;
  company_id: string;
  workflow_run_id: string;
  resource_type: WorkflowTransitionRecord["resourceType"];
  resource_id: string;
  previous_state: WorkflowTransitionRecord["previousState"];
  next_state: WorkflowTransitionRecord["nextState"];
  actor_user_id: string | null;
  actor_name: string;
  basis: string;
  rule_version: string;
  related_materials: WorkflowTransitionRecord["relatedMaterials"] | null;
  occurred_at: string | Date;
}

interface WorkflowCommandRow {
  id: string;
  company_id: string;
  workflow_run_id: string;
  command_type: string;
  resource_type: WorkflowCommandExecution["resourceType"];
  resource_id: string;
  idempotency_key: string;
  object_version: string;
  status: WorkflowCommandExecution["status"];
  progress: string;
  input_snapshot: Record<string, unknown> | null;
  result_snapshot: Record<string, unknown> | null;
  retry_policy: WorkflowCommandExecution["retryPolicy"] | null;
  timeout_policy: WorkflowCommandExecution["timeoutPolicy"] | null;
  attempt_count: number;
  next_retry_at: string | Date | null;
  last_error_code: string | null;
  last_error_detail: string | null;
  executor_user_id: string | null;
  executor_name: string;
  initiator_user_id: string | null;
  initiator_name: string;
  authorizer_user_id: string | null;
  authorizer_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  finished_at: string | Date | null;
}

interface WorkflowCompensationRow {
  id: string;
  company_id: string;
  workflow_run_id: string;
  command_execution_id: string;
  action_type: string;
  status: WorkflowCompensationRecord["status"];
  reason: string;
  handoff_to_user_id: string | null;
  handoff_to_name: string | null;
  notes: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapWorkflowRunRow(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    companyId: row.company_id,
    workflowKey: row.workflow_key,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    currentState: row.current_state,
    initiatorUserId: row.initiator_user_id,
    initiatorName: row.initiator_name,
    authorizerUserId: row.authorizer_user_id,
    authorizerName: row.authorizer_name,
    blockedReason: row.blocked_reason,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapWorkflowTransitionRow(row: WorkflowTransitionRow): WorkflowTransitionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    workflowRunId: row.workflow_run_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    previousState: row.previous_state,
    nextState: row.next_state,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    basis: row.basis,
    ruleVersion: row.rule_version,
    relatedMaterials: row.related_materials ?? [],
    occurredAt: toIsoString(row.occurred_at) || new Date().toISOString()
  };
}

function mapWorkflowCommandRow(row: WorkflowCommandRow): WorkflowCommandExecution {
  return {
    id: row.id,
    companyId: row.company_id,
    workflowRunId: row.workflow_run_id,
    commandType: row.command_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    idempotencyKey: row.idempotency_key,
    objectVersion: row.object_version,
    status: row.status,
    progress: row.progress,
    inputSnapshot: row.input_snapshot ?? {},
    resultSnapshot: row.result_snapshot,
    retryPolicy: row.retry_policy ?? { maxAttempts: 1, backoffMinutes: 0 },
    timeoutPolicy: row.timeout_policy ?? { timeoutSeconds: 300 },
    attemptCount: row.attempt_count,
    nextRetryAt: toIsoString(row.next_retry_at),
    lastErrorCode: row.last_error_code,
    lastErrorDetail: row.last_error_detail,
    executorUserId: row.executor_user_id,
    executorName: row.executor_name,
    initiatorUserId: row.initiator_user_id,
    initiatorName: row.initiator_name,
    authorizerUserId: row.authorizer_user_id,
    authorizerName: row.authorizer_name,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString(),
    finishedAt: toIsoString(row.finished_at)
  };
}

function mapWorkflowCompensationRow(row: WorkflowCompensationRow): WorkflowCompensationRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    workflowRunId: row.workflow_run_id,
    commandExecutionId: row.command_execution_id,
    actionType: row.action_type,
    status: row.status,
    reason: row.reason,
    handoffToUserId: row.handoff_to_user_id,
    handoffToName: row.handoff_to_name,
    notes: row.notes,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    resolvedAt: toIsoString(row.resolved_at)
  };
}

export async function ensureWorkflowRun(
  client: PoolClient,
  run: WorkflowRun
): Promise<WorkflowRun> {
  const existing = await client.query<WorkflowRunRow>(
    `
      select *
      from workflow_runs
      where company_id = $1 and workflow_key = $2 and resource_type = $3 and resource_id = $4
    `,
    [run.companyId, run.workflowKey, run.resourceType, run.resourceId]
  );
  if (existing.rows[0]) {
    return mapWorkflowRunRow(existing.rows[0]);
  }
  await client.query(
    `
      insert into workflow_runs (
        id, company_id, workflow_key, resource_type, resource_id, resource_label,
        current_state, initiator_user_id, initiator_name, authorizer_user_id,
        authorizer_name, blocked_reason, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz)
    `,
    [
      run.id,
      run.companyId,
      run.workflowKey,
      run.resourceType,
      run.resourceId,
      run.resourceLabel,
      run.currentState,
      run.initiatorUserId,
      run.initiatorName,
      run.authorizerUserId,
      run.authorizerName,
      run.blockedReason,
      run.createdAt,
      run.updatedAt
    ]
  );
  return run;
}

export async function updateWorkflowRunState(
  client: PoolClient,
  runId: string,
  state: WorkflowRun["currentState"],
  blockedReason: string | null,
  updatedAt: string
): Promise<void> {
  await client.query(
    `
      update workflow_runs
      set current_state = $1, blocked_reason = $2, updated_at = $3::timestamptz
      where id = $4
    `,
    [state, blockedReason, updatedAt, runId]
  );
}

export async function insertWorkflowTransition(
  client: PoolClient,
  transition: WorkflowTransitionRecord
): Promise<void> {
  await client.query(
    `
      insert into workflow_transition_records (
        id, company_id, workflow_run_id, resource_type, resource_id,
        previous_state, next_state, actor_user_id, actor_name,
        basis, rule_version, related_materials, occurred_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::timestamptz)
    `,
    [
      transition.id,
      transition.companyId,
      transition.workflowRunId,
      transition.resourceType,
      transition.resourceId,
      transition.previousState,
      transition.nextState,
      transition.actorUserId,
      transition.actorName,
      transition.basis,
      transition.ruleVersion,
      JSON.stringify(transition.relatedMaterials),
      transition.occurredAt
    ]
  );
}

export async function listWorkflowRuns(
  companyId: string,
  filters: { resourceType?: string | null; resourceId?: string | null; state?: string | null } = {}
): Promise<WorkflowRun[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (filters.resourceType) {
    params.push(filters.resourceType);
    where += ` and resource_type = $${params.length}`;
  }
  if (filters.resourceId) {
    params.push(filters.resourceId);
    where += ` and resource_id = $${params.length}`;
  }
  if (filters.state) {
    params.push(filters.state);
    where += ` and current_state = $${params.length}`;
  }
  const rows = await query<WorkflowRunRow>(
    `select * from workflow_runs ${where} order by updated_at desc`,
    params
  );
  return rows.map(mapWorkflowRunRow);
}

export async function listWorkflowCommandExecutions(
  companyId: string,
  filters: { workflowRunId?: string | null; resourceType?: string | null; resourceId?: string | null; status?: string | null } = {}
): Promise<WorkflowCommandExecution[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (filters.workflowRunId) {
    params.push(filters.workflowRunId);
    where += ` and workflow_run_id = $${params.length}`;
  }
  if (filters.resourceType) {
    params.push(filters.resourceType);
    where += ` and resource_type = $${params.length}`;
  }
  if (filters.resourceId) {
    params.push(filters.resourceId);
    where += ` and resource_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    where += ` and status = $${params.length}`;
  }
  const rows = await query<WorkflowCommandRow>(
    `select * from workflow_command_executions ${where} order by updated_at desc`,
    params
  );
  return rows.map(mapWorkflowCommandRow);
}

export async function getWorkflowRunDetail(companyId: string, runId: string) {
  const runRow = await queryOne<WorkflowRunRow>(
    `select * from workflow_runs where id = $1 and company_id = $2`,
    [runId, companyId]
  );
  if (!runRow) return null;
  const [transitionRows, commandRows, compensationRows] = await Promise.all([
    query<WorkflowTransitionRow>(
      `select * from workflow_transition_records where workflow_run_id = $1 order by occurred_at desc`,
      [runId]
    ),
    query<WorkflowCommandRow>(
      `select * from workflow_command_executions where workflow_run_id = $1 order by updated_at desc`,
      [runId]
    ),
    query<WorkflowCompensationRow>(
      `select * from workflow_compensation_records where workflow_run_id = $1 order by created_at desc`,
      [runId]
    )
  ]);
  return {
    run: mapWorkflowRunRow(runRow),
    transitions: transitionRows.map(mapWorkflowTransitionRow),
    commands: commandRows.map(mapWorkflowCommandRow),
    compensations: compensationRows.map(mapWorkflowCompensationRow)
  };
}

export async function findWorkflowCommandExecution(
  companyId: string,
  commandId: string
): Promise<WorkflowCommandExecution | null> {
  const row = await queryOne<WorkflowCommandRow>(
    `select * from workflow_command_executions where id = $1 and company_id = $2`,
    [commandId, companyId]
  );
  return row ? mapWorkflowCommandRow(row) : null;
}

export async function getWorkflowCommandDetail(companyId: string, commandId: string) {
  const commandRow = await queryOne<WorkflowCommandRow>(
    `select * from workflow_command_executions where id = $1 and company_id = $2`,
    [commandId, companyId]
  );
  if (!commandRow) {
    return null;
  }
  const [runRow, compensationRows] = await Promise.all([
    queryOne<WorkflowRunRow>(
      `select * from workflow_runs where id = $1 and company_id = $2`,
      [commandRow.workflow_run_id, companyId]
    ),
    query<WorkflowCompensationRow>(
      `select * from workflow_compensation_records where command_execution_id = $1 order by created_at desc`,
      [commandId]
    )
  ]);
  return {
    command: mapWorkflowCommandRow(commandRow),
    run: runRow ? mapWorkflowRunRow(runRow) : null,
    compensations: compensationRows.map(mapWorkflowCompensationRow)
  };
}

export async function findSuccessfulWorkflowCommandExecution(
  companyId: string,
  input: Pick<WorkflowCommandExecution, "resourceType" | "resourceId" | "commandType" | "idempotencyKey" | "objectVersion">
): Promise<WorkflowCommandExecution | null> {
  const row = await queryOne<WorkflowCommandRow>(
    `
      select *
      from workflow_command_executions
      where company_id = $1
        and resource_type = $2
        and resource_id = $3
        and command_type = $4
        and idempotency_key = $5
        and object_version = $6
        and status = 'succeeded'
      order by updated_at desc
      limit 1
    `,
    [companyId, input.resourceType, input.resourceId, input.commandType, input.idempotencyKey, input.objectVersion]
  );
  return row ? mapWorkflowCommandRow(row) : null;
}

export async function insertWorkflowCommandExecution(
  client: PoolClient,
  execution: WorkflowCommandExecution
): Promise<void> {
  await client.query(
    `
      insert into workflow_command_executions (
        id, company_id, workflow_run_id, command_type, resource_type, resource_id,
        idempotency_key, object_version, status, progress, input_snapshot, result_snapshot,
        retry_policy, timeout_policy, attempt_count, next_retry_at, last_error_code, last_error_detail,
        executor_user_id, executor_name, initiator_user_id, initiator_name,
        authorizer_user_id, authorizer_name, created_at, updated_at, finished_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,
        $15,$16::timestamptz,$17,$18,$19,$20,$21,$22,$23,$24,$25::timestamptz,$26::timestamptz,$27::timestamptz
      )
    `,
    [
      execution.id,
      execution.companyId,
      execution.workflowRunId,
      execution.commandType,
      execution.resourceType,
      execution.resourceId,
      execution.idempotencyKey,
      execution.objectVersion,
      execution.status,
      execution.progress,
      JSON.stringify(execution.inputSnapshot),
      execution.resultSnapshot ? JSON.stringify(execution.resultSnapshot) : null,
      JSON.stringify(execution.retryPolicy),
      JSON.stringify(execution.timeoutPolicy),
      execution.attemptCount,
      execution.nextRetryAt,
      execution.lastErrorCode,
      execution.lastErrorDetail,
      execution.executorUserId,
      execution.executorName,
      execution.initiatorUserId,
      execution.initiatorName,
      execution.authorizerUserId,
      execution.authorizerName,
      execution.createdAt,
      execution.updatedAt,
      execution.finishedAt
    ]
  );
}

export async function updateWorkflowCommandExecution(
  client: PoolClient,
  execution: WorkflowCommandExecution
): Promise<void> {
  await client.query(
    `
      update workflow_command_executions
      set
        status = $1,
        progress = $2,
        result_snapshot = $3::jsonb,
        retry_policy = $4::jsonb,
        timeout_policy = $5::jsonb,
        attempt_count = $6,
        next_retry_at = $7::timestamptz,
        last_error_code = $8,
        last_error_detail = $9,
        authorizer_user_id = $10,
        authorizer_name = $11,
        updated_at = $12::timestamptz,
        finished_at = $13::timestamptz
      where id = $14 and company_id = $15
    `,
    [
      execution.status,
      execution.progress,
      execution.resultSnapshot ? JSON.stringify(execution.resultSnapshot) : null,
      JSON.stringify(execution.retryPolicy),
      JSON.stringify(execution.timeoutPolicy),
      execution.attemptCount,
      execution.nextRetryAt,
      execution.lastErrorCode,
      execution.lastErrorDetail,
      execution.authorizerUserId,
      execution.authorizerName,
      execution.updatedAt,
      execution.finishedAt,
      execution.id,
      execution.companyId
    ]
  );
}

export async function insertWorkflowCompensationRecord(
  client: PoolClient,
  record: WorkflowCompensationRecord
): Promise<void> {
  await client.query(
    `
      insert into workflow_compensation_records (
        id, company_id, workflow_run_id, command_execution_id, action_type,
        status, reason, handoff_to_user_id, handoff_to_name, notes, created_at, resolved_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz)
    `,
    [
      record.id,
      record.companyId,
      record.workflowRunId,
      record.commandExecutionId,
      record.actionType,
      record.status,
      record.reason,
      record.handoffToUserId,
      record.handoffToName,
      record.notes,
      record.createdAt,
      record.resolvedAt
    ]
  );
}
