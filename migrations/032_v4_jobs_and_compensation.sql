alter table export_jobs
  add column if not exists retry_count int not null default 0,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table payroll_transfer_batches
  add column if not exists retry_count int not null default 0,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists compensation_status text not null default 'not_required',
  add column if not exists compensation_event_id text,
  add column if not exists compensated_at timestamptz;
