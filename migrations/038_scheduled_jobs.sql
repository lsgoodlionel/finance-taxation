-- F5 调度：可持久化的定时任务队列，供 job runner 轮询执行。
-- 与 modules/jobs/schedule.ts 的退避/选取纯核心配套：runner 只做「取到点 pending →
-- 派发 handler → planRetry 落库」。幂等：可重复执行。

create table if not exists scheduled_jobs (
  id                    text primary key,
  company_id            text,                                  -- 系统级任务可为 null
  kind                  text not null,                         -- 派发给 JOB_HANDLERS 的键
  status                text not null default 'pending',       -- pending|running|completed|failed|dead
  run_at                timestamptz not null default now(),    -- 到点时间
  attempts              int not null default 0,
  max_attempts          int not null default 5,
  recurring_interval_ms bigint,                                -- 非空则成功后按此间隔重排
  payload               jsonb,
  last_error            text,
  last_run_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_scheduled_jobs_due on scheduled_jobs(status, run_at);
create index if not exists idx_scheduled_jobs_company on scheduled_jobs(company_id) where company_id is not null;
