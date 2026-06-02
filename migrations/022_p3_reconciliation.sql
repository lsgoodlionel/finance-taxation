-- P3 对账引擎：对账规则配置表 + 对账结果暂存 + 工资代发批次

-- ── 1. 对账规则配置 ────────────────────────────────────────────────────────────
-- 允许企业自定义匹配规则的权重和容差

create table if not exists reconciliation_rules (
  id           text primary key,
  company_id   text not null unique,

  -- 金额匹配容差（绝对值，元）
  amount_tolerance numeric(10,2) not null default 0.01,

  -- 日期匹配窗口（天数，银行到账可能有T+1/T+2延迟）
  date_window_days int not null default 3,

  -- 自动确认阈值（0-100，≥此分数则自动标记为 auto 匹配）
  auto_confirm_threshold int not null default 85,

  -- 是否在导入后自动触发对账
  auto_run_on_import boolean not null default true,

  -- 未匹配流水超过N天后自动创建经营事项
  unmatched_event_days int not null default 5,

  -- 关键词权重配置（JSON）
  keyword_weights jsonb default '{"工资":15,"薪资":15,"代发":15,"货款":10,"回款":10,"付款":10}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. 对账候选结果（待确认的匹配建议）────────────────────────────────────────

create table if not exists reconciliation_candidates (
  id                 text primary key,
  company_id         text not null,
  statement_id       text not null,        -- bank_statements.id
  voucher_id         text,                 -- vouchers.id（最高分凭证）
  event_id           text,                 -- business_events.id（关联事项）

  -- 匹配分数和策略
  score              int not null,          -- 0-100
  match_reasons      jsonb default '[]',    -- ["金额完全匹配","日期差1天","描述含货款"]
  amount_diff        numeric(18,2),         -- 金额差
  date_diff_days     int,                   -- 日期差

  -- 候选状态
  status             text not null default 'pending', -- pending|confirmed|rejected|superseded
  reviewed_by        text,
  reviewed_at        timestamptz,

  created_at         timestamptz not null default now()
);

create index if not exists idx_recon_candidates_company  on reconciliation_candidates(company_id);
create index if not exists idx_recon_candidates_stmt     on reconciliation_candidates(statement_id);
create index if not exists idx_recon_candidates_status   on reconciliation_candidates(status);

-- ── 3. 工资代发批次 ────────────────────────────────────────────────────────────

create table if not exists payroll_transfer_batches (
  id               text primary key,
  company_id       text not null,
  payroll_period   text not null,           -- YYYY-MM

  -- 关联
  bank_account_id  text,                    -- bank_accounts.id
  bank_statement_id text,                   -- 代发完成后关联流水

  -- 金额汇总
  total_amount     numeric(18,2) not null default 0,
  employee_count   int not null default 0,

  -- 状态
  status           text not null default 'draft', -- draft|approved|exported|disbursed|confirmed
  approved_by      text,
  approved_at      timestamptz,
  exported_at      timestamptz,
  disbursed_at     timestamptz,
  bank_transfer_ref text,                   -- 银行代发批次号

  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (company_id, payroll_period)
);

create index if not exists idx_payroll_transfers_company on payroll_transfer_batches(company_id);
