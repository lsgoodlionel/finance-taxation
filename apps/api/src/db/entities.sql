-- Sprint 0 draft entities for V2 foundation

create table roles (
  id uuid primary key,
  company_id uuid not null,
  code text not null,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table role_permissions (
  id uuid primary key,
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null,
  scope text not null,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key,
  company_id uuid not null,
  parent_department_id uuid null references departments(id),
  name text not null,
  leader_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users_v2 (
  id uuid primary key,
  company_id uuid not null,
  department_id uuid null references departments(id),
  username text not null,
  display_name text not null,
  email text null,
  phone text null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, username)
);

create table user_roles (
  id uuid primary key,
  user_id uuid not null references users_v2(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create table business_events (
  id uuid primary key,
  company_id uuid not null,
  type text not null,
  title text not null,
  description text not null,
  department text not null,
  owner_id uuid null references users_v2(id),
  occurred_on date not null,
  amount numeric(18, 2) null,
  currency text not null default 'CNY',
  status text not null,
  source text not null,
  counterparty_id uuid null,
  project_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_event_relations (
  id uuid primary key,
  company_id uuid not null,
  business_event_id uuid not null references business_events(id) on delete cascade,
  relation_type text not null,
  target_id uuid not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table tasks_v2 (
  id uuid primary key,
  company_id uuid not null,
  business_event_id uuid null references business_events(id),
  parent_task_id uuid null references tasks_v2(id),
  title text not null,
  description text not null,
  status text not null,
  priority text not null,
  owner_id uuid null references users_v2(id),
  due_at timestamptz null,
  assignee_department text null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_checklist_items (
  id uuid primary key,
  task_id uuid not null references tasks_v2(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  required boolean not null default true,
  created_at timestamptz not null default now()
);
