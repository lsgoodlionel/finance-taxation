create table rnd_projects (
  id                      text primary key,
  company_id              text not null references companies(id),
  business_event_id       text null references business_events(id) on delete set null,
  code                    text not null,
  name                    text not null,
  status                  text not null default 'planning',
  capitalization_policy   text not null default 'mixed',
  started_on              date not null,
  ended_on                date null,
  owner_id                text null references users(id),
  notes                   text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, code)
);

create index idx_rnd_projects_company on rnd_projects(company_id);
create index idx_rnd_projects_event on rnd_projects(business_event_id);

create table rnd_cost_lines (
  id                    text primary key,
  company_id            text not null references companies(id),
  project_id            text not null references rnd_projects(id) on delete cascade,
  business_event_id     text null references business_events(id) on delete set null,
  voucher_id            text null references vouchers(id) on delete set null,
  cost_type             text not null,
  accounting_treatment  text not null,
  amount                numeric(18, 2) not null default 0,
  occurred_on           date not null,
  notes                 text not null default '',
  created_at            timestamptz not null default now()
);

create index idx_rnd_cost_lines_project on rnd_cost_lines(project_id);
create index idx_rnd_cost_lines_event on rnd_cost_lines(business_event_id);

create table rnd_time_entries (
  id                text primary key,
  company_id        text not null references companies(id),
  project_id        text not null references rnd_projects(id) on delete cascade,
  business_event_id text null references business_events(id) on delete set null,
  user_id           text null references users(id) on delete set null,
  staff_name        text not null,
  work_date         date not null,
  hours             numeric(10, 2) not null default 0,
  notes             text not null default '',
  created_at        timestamptz not null default now()
);

create index idx_rnd_time_entries_project on rnd_time_entries(project_id);

create table risk_findings (
  id                text primary key,
  company_id        text not null references companies(id),
  business_event_id text null references business_events(id) on delete cascade,
  rule_code         text not null,
  severity          text not null default 'medium',
  status            text not null default 'open',
  title             text not null,
  detail            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_risk_findings_company on risk_findings(company_id, status, severity);
create index idx_risk_findings_event on risk_findings(business_event_id);
