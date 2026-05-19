-- Migration: 016_ai_config
-- 前端可配置的 AI 后端设置，按公司存储（一行一公司）

create table if not exists ai_configs (
  id            text primary key default gen_random_uuid()::text,
  company_id    text not null references companies(id) on delete cascade,
  provider      text not null default 'ollama',
  model         text not null default 'gemma4:latest',
  api_key       text,
  base_url      text,
  extra_config  jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ai_configs_company_id_unique unique (company_id)
);
