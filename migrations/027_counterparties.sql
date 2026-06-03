-- P7-B2 往来单位主数据（客户/供应商档案）

create table if not exists counterparties (
  id            text primary key,
  company_id    text not null,
  name          text not null,
  category      text not null default 'both',   -- customer | supplier | both
  tax_no        text not null default '',
  contact_name  text not null default '',
  contact_phone text not null default '',
  credit_limit  numeric(18,2) not null default 0,
  credit_days   int not null default 0,         -- 信用账期（天）
  risk_level    text not null default 'normal',  -- normal | watch | high
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists idx_counterparties_company on counterparties(company_id);
