create table export_jobs (
  id                 text primary key,
  company_id         text not null references companies(id),
  kind               text not null,
  label              text not null,
  file_name          text not null,
  resource_type      text,
  resource_id        text,
  period_label       text,
  status             text not null default 'created',
  created_by_user_id text,
  created_by_name    text not null,
  created_at         timestamptz not null default now()
);

create index idx_export_jobs_company_created_at
  on export_jobs(company_id, created_at desc);

create table export_archive_entries (
  id           text primary key,
  company_id   text not null references companies(id),
  job_id       text not null references export_jobs(id) on delete cascade,
  archive_key  text not null,
  kind         text not null,
  title        text not null,
  file_name    text not null,
  object_type  text not null,
  object_id    text,
  period_label text,
  created_at   timestamptz not null default now()
);

create index idx_export_archive_entries_company_created_at
  on export_archive_entries(company_id, created_at desc);

create index idx_export_archive_entries_archive_key
  on export_archive_entries(company_id, archive_key, created_at desc);
