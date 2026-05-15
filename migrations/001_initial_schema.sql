-- Migration: 001_initial_schema
-- 建立 V2 全量 PostgreSQL schema

-- ─── Migration tracking ────────────────────────────────────────────────────
create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- ─── Companies ─────────────────────────────────────────────────────────────
create table companies (
  id         text primary key,
  name       text not null,
  status     text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Departments ───────────────────────────────────────────────────────────
create table departments (
  id                   text primary key,
  company_id           text not null references companies(id),
  parent_department_id text null     references departments(id),
  name                 text not null,
  leader_user_id       text null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_departments_company on departments(company_id);

-- ─── Users ─────────────────────────────────────────────────────────────────
create table users (
  id            text primary key,
  company_id    text not null references companies(id),
  department_id text null    references departments(id),
  username      text not null,
  display_name  text not null,
  email         text null,
  phone         text null,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, username)
);

create index idx_users_company on users(company_id);

-- ─── User Passwords ─────────────────────────────────────────────────────────
create table user_passwords (
  user_id       text primary key references users(id) on delete cascade,
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

-- ─── Roles ─────────────────────────────────────────────────────────────────
create table roles (
  id          text primary key,
  company_id  text not null references companies(id),
  code        text not null,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);

create index idx_roles_company on roles(company_id);

-- ─── Role Permissions ──────────────────────────────────────────────────────
create table role_permissions (
  id             text primary key,
  role_id        text not null references roles(id) on delete cascade,
  permission_key text not null,
  scope          text not null default 'company',
  created_at     timestamptz not null default now(),
  unique (role_id, permission_key)
);

-- ─── User Roles ────────────────────────────────────────────────────────────
create table user_roles (
  user_id    text not null references users(id) on delete cascade,
  role_id    text not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ─── Sessions ──────────────────────────────────────────────────────────────
create table sessions (
  id                 text primary key,
  company_id         text not null references companies(id),
  user_id            text not null references users(id) on delete cascade,
  username           text not null,
  department_id      text null,
  role_codes         text[] not null default '{}',
  access_token       text not null unique,
  refresh_token      text not null unique,
  status             text not null default 'active',
  created_at         timestamptz not null default now(),
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null
);

create index idx_sessions_access_token  on sessions(access_token)  where status = 'active';
create index idx_sessions_refresh_token on sessions(refresh_token) where status = 'active';
create index idx_sessions_user          on sessions(user_id);

-- ─── Business Events ───────────────────────────────────────────────────────
create table business_events (
  id              text primary key,
  company_id      text not null references companies(id),
  type            text not null,
  title           text not null,
  description     text not null default '',
  department      text not null default '',
  owner_id        text null references users(id),
  occurred_on     date not null,
  amount          numeric(18, 2) null,
  currency        text not null default 'CNY',
  status          text not null default 'draft',
  source          text not null default 'manual',
  counterparty_id text null,
  project_id      text null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_business_events_company  on business_events(company_id);
create index idx_business_events_status   on business_events(company_id, status);
create index idx_business_events_occurred on business_events(company_id, occurred_on desc);

-- ─── Business Event Relations ──────────────────────────────────────────────
create table business_event_relations (
  id                text primary key,
  company_id        text not null,
  business_event_id text not null references business_events(id) on delete cascade,
  relation_type     text not null,
  target_id         text not null,
  label             text not null,
  created_at        timestamptz not null default now()
);

create index idx_event_relations_event on business_event_relations(business_event_id);

-- ─── Business Event Activities ─────────────────────────────────────────────
create table business_event_activities (
  id                text primary key,
  company_id        text not null,
  business_event_id text not null references business_events(id) on delete cascade,
  activity_type     text not null,
  actor_user_id     text null,
  actor_name        text not null,
  summary           text not null,
  created_at        timestamptz not null default now()
);

create index idx_event_activities_event on business_event_activities(business_event_id);

-- ─── Event Document Mappings ───────────────────────────────────────────────
create table event_document_mappings (
  id                text primary key,
  company_id        text not null,
  business_event_id text not null references business_events(id) on delete cascade,
  document_type     text not null,
  title             text not null,
  status            text not null default 'required',
  owner_department  text not null default '',
  notes             text not null default '',
  created_at        timestamptz not null default now()
);

create index idx_doc_mappings_event on event_document_mappings(business_event_id);

-- ─── Event Tax Mappings ────────────────────────────────────────────────────
create table event_tax_mappings (
  id                text primary key,
  company_id        text not null,
  business_event_id text not null references business_events(id) on delete cascade,
  tax_type          text not null,
  treatment         text not null,
  status            text not null default 'pending',
  basis             text not null default '',
  filing_period     text not null default '',
  created_at        timestamptz not null default now()
);

create index idx_tax_mappings_event on event_tax_mappings(business_event_id);

-- ─── Event Voucher Drafts ──────────────────────────────────────────────────
create table event_voucher_drafts (
  id                text primary key,
  company_id        text not null,
  business_event_id text not null references business_events(id) on delete cascade,
  voucher_type      text not null,
  status            text not null default 'draft',
  summary           text not null,
  created_at        timestamptz not null default now()
);

create index idx_voucher_drafts_event on event_voucher_drafts(business_event_id);

-- ─── Voucher Draft Lines ───────────────────────────────────────────────────
create table voucher_draft_lines (
  id           text primary key,
  draft_id     text not null references event_voucher_drafts(id) on delete cascade,
  summary      text not null,
  account_code text not null,
  account_name text not null,
  debit        numeric(18, 2) not null default 0,
  credit       numeric(18, 2) not null default 0,
  sort_order   int not null default 0
);

create index idx_voucher_draft_lines_draft on voucher_draft_lines(draft_id);

-- ─── Tasks ─────────────────────────────────────────────────────────────────
create table tasks (
  id                  text primary key,
  company_id          text not null references companies(id),
  business_event_id   text null references business_events(id),
  parent_task_id      text null references tasks(id),
  title               text not null,
  description         text not null default '',
  status              text not null default 'not_started',
  priority            text not null default 'medium',
  owner_id            text null references users(id),
  due_at              timestamptz null,
  assignee_department text null,
  source              text not null default 'manual',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_tasks_company on tasks(company_id);
create index idx_tasks_event   on tasks(business_event_id);
create index idx_tasks_parent  on tasks(parent_task_id);
create index idx_tasks_status  on tasks(company_id, status);

-- ─── Task Checklist Items ──────────────────────────────────────────────────
create table task_checklist_items (
  id         text primary key,
  task_id    text not null references tasks(id) on delete cascade,
  title      text not null,
  completed  boolean not null default false,
  required   boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── Generated Documents ───────────────────────────────────────────────────
create table generated_documents (
  id                text primary key,
  company_id        text not null references companies(id),
  business_event_id text not null references business_events(id),
  mapping_id        text not null references event_document_mappings(id),
  document_type     text not null,
  title             text not null,
  owner_department  text not null default '',
  status            text not null default 'draft',
  source            text not null default 'analysis',
  archived_at       timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_documents_company on generated_documents(company_id);
create index idx_documents_event   on generated_documents(business_event_id);

-- ─── Document Attachment Records ───────────────────────────────────────────
create table document_attachment_records (
  id          text primary key,
  company_id  text not null,
  document_id text not null references generated_documents(id) on delete cascade,
  file_name   text not null,
  file_type   text not null,
  file_size   int  not null default 0,
  storage_key text null,
  uploaded_at timestamptz not null default now()
);

create index idx_attachments_document on document_attachment_records(document_id);

-- ─── Tax Items ─────────────────────────────────────────────────────────────
create table tax_items (
  id                text primary key,
  company_id        text not null references companies(id),
  business_event_id text not null references business_events(id),
  mapping_id        text not null references event_tax_mappings(id),
  tax_type          text not null,
  treatment         text not null,
  basis             text not null default '',
  filing_period     text not null default '',
  status            text not null default 'pending',
  source            text not null default 'analysis',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_tax_items_company on tax_items(company_id);
create index idx_tax_items_event   on tax_items(business_event_id);
create index idx_tax_items_period  on tax_items(company_id, filing_period);

-- ─── Tax Filing Batches ────────────────────────────────────────────────────
create table tax_filing_batches (
  id            text primary key,
  company_id    text not null references companies(id),
  tax_type      text not null,
  filing_period text not null,
  status        text not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_tax_batches_company on tax_filing_batches(company_id);
create index idx_tax_batches_period  on tax_filing_batches(company_id, filing_period);

-- ─── Tax Filing Batch Items (junction) ────────────────────────────────────
create table tax_filing_batch_items (
  batch_id    text not null references tax_filing_batches(id) on delete cascade,
  tax_item_id text not null references tax_items(id),
  primary key (batch_id, tax_item_id)
);

-- ─── Vouchers ──────────────────────────────────────────────────────────────
create table vouchers (
  id                text primary key,
  company_id        text not null references companies(id),
  business_event_id text not null references business_events(id),
  mapping_id        text not null references event_voucher_drafts(id),
  voucher_type      text not null,
  summary           text not null,
  status            text not null default 'draft',
  source            text not null default 'analysis',
  approved_at       timestamptz null,
  posted_at         timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_vouchers_company on vouchers(company_id);
create index idx_vouchers_event   on vouchers(business_event_id);
create index idx_vouchers_status  on vouchers(company_id, status);

-- ─── Voucher Lines ─────────────────────────────────────────────────────────
create table voucher_lines (
  id           text primary key,
  voucher_id   text not null references vouchers(id) on delete cascade,
  summary      text not null,
  account_code text not null,
  account_name text not null,
  debit        numeric(18, 2) not null default 0,
  credit       numeric(18, 2) not null default 0,
  sort_order   int not null default 0
);

create index idx_voucher_lines_voucher on voucher_lines(voucher_id);

-- ─── Voucher Posting Records ───────────────────────────────────────────────
create table voucher_posting_records (
  id                text primary key,
  company_id        text not null,
  voucher_id        text not null references vouchers(id),
  business_event_id text not null,
  posted_by_user_id text null,
  posted_by_name    text not null,
  posted_at         timestamptz not null default now()
);

create index idx_posting_records_voucher on voucher_posting_records(voucher_id);

-- ─── Ledger Entries ────────────────────────────────────────────────────────
create table ledger_entries (
  id                text primary key,
  company_id        text not null references companies(id),
  voucher_id        text not null references vouchers(id),
  business_event_id text not null references business_events(id),
  entry_date        date not null,
  summary           text not null,
  account_code      text not null,
  account_name      text not null,
  debit             numeric(18, 2) not null default 0,
  credit            numeric(18, 2) not null default 0,
  source            text not null default 'voucher_posting',
  posted_at         timestamptz not null default now()
);

create index idx_ledger_company on ledger_entries(company_id);
create index idx_ledger_voucher on ledger_entries(voucher_id);
create index idx_ledger_event   on ledger_entries(business_event_id);
create index idx_ledger_account on ledger_entries(company_id, account_code);

-- ─── Ledger Posting Batches ────────────────────────────────────────────────
create table ledger_posting_batches (
  id                text primary key,
  company_id        text not null references companies(id),
  voucher_id        text not null references vouchers(id),
  business_event_id text not null references business_events(id),
  posted_at         timestamptz not null default now()
);

create index idx_posting_batches_company on ledger_posting_batches(company_id);
create index idx_posting_batches_voucher on ledger_posting_batches(voucher_id);

-- ─── Ledger Posting Batch Entries (junction) ──────────────────────────────
create table ledger_posting_batch_entries (
  batch_id text not null references ledger_posting_batches(id) on delete cascade,
  entry_id text not null references ledger_entries(id),
  primary key (batch_id, entry_id)
);
