-- P6-A1 AI 结果留痕底座
-- 所有 AI Agent 的运行与输出版本化存储，满足蓝图「可解释 / 可回放 / 可追溯」

-- ── AI 运行记录 ────────────────────────────────────────────────────────────────
create table if not exists ai_task_runs (
  id            text primary key,
  company_id    text not null,
  agent_type    text not null,           -- accounting | completeness | tax | audit | event | boss | secretary
  status        text not null default 'running',  -- running | done | error
  input_summary text not null default '',
  model         text not null default '',
  duration_ms   int,
  error_message text,
  created_by    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_ai_runs_company on ai_task_runs(company_id, agent_type, created_at desc);

-- ── AI 分析结果（版本化，可关联具体业务对象）──────────────────────────────────
create table if not exists ai_analysis_results (
  id             text primary key,
  run_id         text not null references ai_task_runs(id) on delete cascade,
  company_id     text not null,
  agent_type     text not null,
  result_type    text not null default 'suggestion',  -- suggestion | finding | answer | draft
  resource_type  text,                    -- business_event | invoice | voucher | tax_item ...
  resource_id    text,
  content        jsonb not null default '{}',          -- 结构化结论
  summary        text not null default '',
  sources        jsonb not null default '[]',          -- 依据/数据来源
  confidence     numeric(4,3),            -- 0-1
  accepted       boolean,                 -- 人工是否采纳（null=未处理）
  created_at     timestamptz not null default now()
);
create index if not exists idx_ai_results_company  on ai_analysis_results(company_id, agent_type, created_at desc);
create index if not exists idx_ai_results_resource on ai_analysis_results(resource_type, resource_id);
