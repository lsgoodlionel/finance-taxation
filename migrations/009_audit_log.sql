-- Sprint P3-5: 完整审计日志

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  user_id       text,
  user_name     text,
  action        text not null,        -- create | update | delete | approve | post | archive | close | compute | confirm | analyze
  resource_type text not null,        -- business_event | voucher | document | contract | employee | payroll | tax_item | risk_finding
  resource_id   text,
  resource_label text,
  changes       jsonb,               -- { before, after } or { data }
  created_at    timestamptz not null default now()
);

create index idx_audit_logs_company_time on audit_logs(company_id, created_at desc);
create index idx_audit_logs_resource     on audit_logs(resource_type, resource_id);
create index idx_audit_logs_user         on audit_logs(user_id, created_at desc);
