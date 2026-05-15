create table report_snapshots (
  id            text primary key,
  company_id    text not null references companies(id),
  report_type   text not null,
  period_type   text not null,
  period_label  text not null,
  snapshot_date date not null,
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);

create index idx_report_snapshots_company on report_snapshots(company_id, report_type, period_type, snapshot_date desc);
create unique index uq_report_snapshots_period on report_snapshots(company_id, report_type, period_type, period_label);
