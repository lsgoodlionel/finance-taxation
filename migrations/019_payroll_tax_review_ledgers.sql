create table if not exists payroll_tax_review_ledgers (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  period text not null,
  review_type text not null check (review_type in ('iit', 'social_security', 'housing_fund')),
  business_event_id text references business_events(id) on delete set null,
  tax_item_ids text[] not null default '{}',
  total_employee_amount numeric(18,2) not null default 0,
  total_employer_amount numeric(18,2) not null default 0,
  status text not null check (status in ('pending', 'ready', 'reviewed')) default 'pending',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_payroll_tax_review_ledgers_period_type
  on payroll_tax_review_ledgers(company_id, period, review_type);
