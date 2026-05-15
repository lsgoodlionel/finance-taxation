create table if not exists contracts (
  id                  text primary key,
  company_id          text not null,
  contract_no         text not null,
  contract_type       text not null,
  title               text not null,
  counterparty_name   text not null,
  counterparty_type   text not null default 'external',
  amount              numeric(18,2) not null default 0,
  currency            text not null default 'CNY',
  signed_date         date,
  start_date          date,
  end_date            date,
  status              text not null default 'active',
  notes               text not null default '',
  created_by_user_id  text,
  created_by_name     text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_contracts_company
  on contracts(company_id, created_at desc);

create index if not exists idx_contracts_status
  on contracts(company_id, status);

create index if not exists idx_contracts_type
  on contracts(company_id, contract_type);

alter table business_events
  add column if not exists contract_id text references contracts(id) on delete set null;

create index if not exists idx_business_events_contract
  on business_events(contract_id)
  where contract_id is not null;
