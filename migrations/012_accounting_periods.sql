-- 账期锁定控制表
-- 支持对指定会计期间（YYYY-MM）进行锁定，锁定后禁止在该期间内新增/修改凭证过账
create table if not exists accounting_periods (
  id          text primary key default 'period-' || replace(gen_random_uuid()::text, '-', ''),
  company_id  text not null references companies(id),
  period      text not null,           -- YYYY-MM 格式
  is_locked   boolean not null default false,
  locked_at   timestamptz,
  locked_by   text,                    -- 操作人用户名
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(company_id, period)
);

create index if not exists idx_accounting_periods_company_period
  on accounting_periods(company_id, period);
