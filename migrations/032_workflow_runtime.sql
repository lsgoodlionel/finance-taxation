create table if not exists workflow_runs (
  id                 text primary key,
  company_id         text not null references companies(id),
  workflow_key       text not null,
  resource_type      text not null,
  resource_id        text not null,
  resource_label     text not null default '',
  current_state      text not null,
  initiator_user_id  text,
  initiator_name     text not null default '',
  authorizer_user_id text,
  authorizer_name    text,
  blocked_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists idx_workflow_runs_company_object
  on workflow_runs(company_id, workflow_key, resource_type, resource_id);

create index if not exists idx_workflow_runs_company_state
  on workflow_runs(company_id, current_state, updated_at desc);

create table if not exists workflow_transition_records (
  id                text primary key,
  company_id        text not null references companies(id),
  workflow_run_id   text not null references workflow_runs(id) on delete cascade,
  resource_type     text not null,
  resource_id       text not null,
  previous_state    text not null,
  next_state        text not null,
  actor_user_id     text,
  actor_name        text not null default '',
  basis             text not null default '',
  rule_version      text not null default '',
  related_materials jsonb not null default '[]',
  occurred_at       timestamptz not null
);

create index if not exists idx_workflow_transitions_run_time
  on workflow_transition_records(workflow_run_id, occurred_at desc);

create table if not exists workflow_command_executions (
  id                 text primary key,
  company_id         text not null references companies(id),
  workflow_run_id    text not null references workflow_runs(id) on delete cascade,
  command_type       text not null,
  resource_type      text not null,
  resource_id        text not null,
  idempotency_key    text not null,
  object_version     text not null,
  status             text not null default 'waiting',
  progress           text not null default '',
  input_snapshot     jsonb not null default '{}',
  result_snapshot    jsonb,
  retry_policy       jsonb not null default '{"maxAttempts":1,"backoffMinutes":0}',
  timeout_policy     jsonb not null default '{"timeoutSeconds":300}',
  attempt_count      int not null default 0,
  next_retry_at      timestamptz,
  last_error_code    text,
  last_error_detail  text,
  executor_user_id   text,
  executor_name      text not null default '',
  initiator_user_id  text,
  initiator_name     text not null default '',
  authorizer_user_id text,
  authorizer_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  finished_at        timestamptz
);

create unique index if not exists idx_workflow_commands_idempotent
  on workflow_command_executions(company_id, resource_type, resource_id, command_type, idempotency_key, object_version);

create index if not exists idx_workflow_commands_company_status
  on workflow_command_executions(company_id, status, updated_at desc);

create table if not exists workflow_compensation_records (
  id                   text primary key,
  company_id           text not null references companies(id),
  workflow_run_id      text not null references workflow_runs(id) on delete cascade,
  command_execution_id text not null references workflow_command_executions(id) on delete cascade,
  action_type          text not null,
  status               text not null default 'open',
  reason               text not null default '',
  handoff_to_user_id   text,
  handoff_to_name      text,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

create index if not exists idx_workflow_compensations_run
  on workflow_compensation_records(workflow_run_id, created_at desc);
