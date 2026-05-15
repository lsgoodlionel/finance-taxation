create table taxpayer_profiles (
  id             text primary key,
  company_id     text not null references companies(id),
  taxpayer_type  text not null,
  effective_from date not null,
  status         text not null default 'active',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_taxpayer_profiles_company on taxpayer_profiles(company_id, status, effective_from desc);

create table risk_closure_records (
  id                text primary key,
  company_id        text not null references companies(id),
  finding_id        text not null references risk_findings(id) on delete cascade,
  closed_by_user_id text null references users(id) on delete set null,
  closed_by_name    text not null,
  resolution        text not null,
  reviewed_at       timestamptz not null default now()
);

create index idx_risk_closure_records_finding on risk_closure_records(finding_id);
