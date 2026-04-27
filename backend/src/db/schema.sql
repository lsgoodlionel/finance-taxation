-- Core tenants and users
create table companies (
  id uuid primary key,
  name varchar(200) not null,
  credit_code varchar(32) not null unique,
  legal_representative varchar(100),
  phone varchar(50),
  address varchar(255),
  bank_name varchar(200),
  bank_account varchar(100),
  taxpayer_identity varchar(32) not null default 'general',
  vat_method varchar(32) not null default 'standard',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table roles (
  id uuid primary key,
  company_id uuid references companies(id),
  code varchar(50) not null,
  name varchar(100) not null,
  description text,
  created_at timestamp not null default current_timestamp
);

create table users (
  id uuid primary key,
  company_id uuid not null references companies(id),
  role_id uuid references roles(id),
  username varchar(100) not null,
  password_hash varchar(255) not null,
  display_name varchar(100) not null,
  phone varchar(50),
  email varchar(120),
  status varchar(20) not null default 'active',
  last_login_at timestamp,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  unique (company_id, username)
);

create table sessions (
  id uuid primary key,
  company_id uuid not null references companies(id),
  user_id uuid not null references users(id),
  refresh_token_hash varchar(255) not null,
  expires_at timestamp not null,
  created_at timestamp not null default current_timestamp
);

-- Master data
create table counterparties (
  id uuid primary key,
  company_id uuid not null references companies(id),
  name varchar(200) not null,
  type varchar(50) not null,
  tax_no varchar(50),
  contact varchar(100),
  phone varchar(50),
  created_at timestamp not null default current_timestamp
);

create table projects (
  id uuid primary key,
  company_id uuid not null references companies(id),
  name varchar(200) not null,
  project_type varchar(50) not null,
  department varchar(100),
  status varchar(20) not null default 'active',
  created_at timestamp not null default current_timestamp
);

create table contracts (
  id uuid primary key,
  company_id uuid not null references companies(id),
  counterparty_id uuid references counterparties(id),
  project_id uuid references projects(id),
  contract_no varchar(100) not null,
  contract_type varchar(50) not null,
  signed_date date,
  amount numeric(18,2),
  tax_inclusive_amount numeric(18,2),
  status varchar(20) not null default 'draft',
  created_at timestamp not null default current_timestamp,
  unique (company_id, contract_no)
);

-- Document and archive domain
create table documents (
  id uuid primary key,
  company_id uuid not null references companies(id),
  code varchar(100) not null,
  title varchar(200) not null,
  document_type varchar(50) not null,
  category varchar(50),
  business_scene varchar(100),
  department varchar(100),
  owner_user_id uuid references users(id),
  counterparty_id uuid references counterparties(id),
  contract_id uuid references contracts(id),
  amount numeric(18,2),
  metric_text varchar(100),
  document_date date not null,
  status varchar(30) not null default 'draft',
  source varchar(30) not null default 'system',
  summary text,
  snapshot_json text,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  unique (company_id, code)
);

create table document_versions (
  id uuid primary key,
  company_id uuid not null references companies(id),
  document_id uuid not null references documents(id),
  version_no integer not null,
  content_json text not null,
  created_by uuid references users(id),
  created_at timestamp not null default current_timestamp,
  unique (document_id, version_no)
);

create table attachments (
  id uuid primary key,
  company_id uuid not null references companies(id),
  document_id uuid references documents(id),
  file_name varchar(255) not null,
  mime_type varchar(100),
  size_bytes bigint,
  storage_key varchar(255) not null,
  source varchar(50) not null default 'upload',
  uploaded_by uuid references users(id),
  uploaded_at timestamp not null default current_timestamp
);

create table document_attachment_links (
  id uuid primary key,
  company_id uuid not null references companies(id),
  document_id uuid not null references documents(id),
  attachment_id uuid not null references attachments(id),
  link_type varchar(50) not null default 'primary',
  created_at timestamp not null default current_timestamp
);

-- AI and workflow
create table analysis_results (
  id uuid primary key,
  company_id uuid not null references companies(id),
  source_text text not null,
  department varchar(100),
  business_date date,
  rule_scene varchar(100),
  final_scene varchar(100),
  confidence numeric(5,4),
  account_suggestion_json text,
  tax_focus_json text,
  refs_json text,
  visible_process_json text,
  risk_note text,
  result_json text not null,
  created_by uuid references users(id),
  created_at timestamp not null default current_timestamp
);

create table workflow_tasks (
  id uuid primary key,
  company_id uuid not null references companies(id),
  document_id uuid references documents(id),
  task_type varchar(50) not null,
  task_status varchar(30) not null default 'pending',
  assignee_user_id uuid references users(id),
  note text,
  due_date date,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

-- Tax domain
create table tax_items (
  id uuid primary key,
  company_id uuid not null references companies(id),
  tax_type varchar(50) not null,
  taxpayer_identity varchar(32) not null,
  tax_period varchar(50) not null,
  document_id uuid references documents(id),
  amount numeric(18,2),
  metric_json text,
  status varchar(30) not null default 'draft',
  created_at timestamp not null default current_timestamp
);

create table taxpayer_profiles (
  id uuid primary key,
  company_id uuid not null references companies(id),
  taxpayer_identity varchar(32) not null,
  vat_method varchar(32) not null,
  effective_from date not null,
  effective_to date,
  config_json text,
  created_at timestamp not null default current_timestamp
);

-- Ledger domain
create table chart_of_accounts (
  id uuid primary key,
  company_id uuid not null references companies(id),
  account_code varchar(50) not null,
  account_name varchar(200) not null,
  account_type varchar(50) not null,
  direction varchar(10) not null,
  parent_id uuid references chart_of_accounts(id),
  enabled boolean not null default true,
  created_at timestamp not null default current_timestamp,
  unique (company_id, account_code)
);

create table vouchers (
  id uuid primary key,
  company_id uuid not null references companies(id),
  document_id uuid references documents(id),
  voucher_no varchar(100) not null,
  voucher_date date not null,
  summary text,
  status varchar(30) not null default 'draft',
  created_by uuid references users(id),
  created_at timestamp not null default current_timestamp,
  unique (company_id, voucher_no)
);

create table voucher_entries (
  id uuid primary key,
  company_id uuid not null references companies(id),
  voucher_id uuid not null references vouchers(id),
  account_id uuid not null references chart_of_accounts(id),
  debit_amount numeric(18,2) not null default 0,
  credit_amount numeric(18,2) not null default 0,
  auxiliary_json text,
  line_no integer not null
);

create table account_balances (
  id uuid primary key,
  company_id uuid not null references companies(id),
  account_id uuid not null references chart_of_accounts(id),
  period varchar(20) not null,
  opening_debit numeric(18,2) not null default 0,
  opening_credit numeric(18,2) not null default 0,
  period_debit numeric(18,2) not null default 0,
  period_credit numeric(18,2) not null default 0,
  closing_debit numeric(18,2) not null default 0,
  closing_credit numeric(18,2) not null default 0,
  unique (company_id, account_id, period)
);

-- Reconciliation and audit
create table reconciliation_checks (
  id uuid primary key,
  company_id uuid not null references companies(id),
  check_type varchar(100) not null,
  period varchar(50),
  status varchar(30) not null default 'pending',
  result_json text,
  created_at timestamp not null default current_timestamp
);

create table audit_logs (
  id uuid primary key,
  company_id uuid not null references companies(id),
  user_id uuid references users(id),
  action varchar(100) not null,
  target_type varchar(50) not null,
  target_id uuid,
  detail_json text,
  created_at timestamp not null default current_timestamp
);
