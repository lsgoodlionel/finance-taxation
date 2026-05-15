create table if not exists employees (
  id                  text primary key,
  company_id          text not null,
  department_id       text,
  name                text not null,
  id_card             text not null default '',
  position            text not null default '',
  hire_date           date,
  leave_date          date,
  base_salary         numeric(12,2) not null default 0,
  status              text not null default 'active',
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_employees_company
  on employees(company_id, status);

create table if not exists payroll_policy (
  id                          text primary key,
  company_id                  text not null unique,
  social_security_base_min    numeric(12,2) not null default 4000,
  social_security_base_max    numeric(12,2) not null default 26000,
  pension_employee_rate       numeric(6,4) not null default 0.08,
  pension_employer_rate       numeric(6,4) not null default 0.16,
  medical_employee_rate       numeric(6,4) not null default 0.02,
  medical_employer_rate       numeric(6,4) not null default 0.085,
  unemployment_employee_rate  numeric(6,4) not null default 0.005,
  unemployment_employer_rate  numeric(6,4) not null default 0.005,
  housing_fund_employee_rate  numeric(6,4) not null default 0.12,
  housing_fund_employer_rate  numeric(6,4) not null default 0.12,
  iit_threshold               numeric(12,2) not null default 5000,
  updated_at                  timestamptz not null default now()
);

create table if not exists payroll_records (
  id                          text primary key,
  company_id                  text not null,
  period                      text not null,
  employee_id                 text not null references employees(id),
  employee_name               text not null,
  gross_salary                numeric(12,2) not null default 0,
  social_security_employee    numeric(12,2) not null default 0,
  social_security_employer    numeric(12,2) not null default 0,
  housing_fund_employee       numeric(12,2) not null default 0,
  housing_fund_employer       numeric(12,2) not null default 0,
  iit_withheld                numeric(12,2) not null default 0,
  net_pay                     numeric(12,2) not null default 0,
  status                      text not null default 'draft',
  confirmed_at                timestamptz,
  confirmed_by_user_id        text,
  confirmed_by_name           text not null default '',
  notes                       text not null default '',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists idx_payroll_period_employee
  on payroll_records(company_id, period, employee_id);

create index if not exists idx_payroll_company_period
  on payroll_records(company_id, period);

-- Default payroll policy for seed company
insert into payroll_policy (id, company_id) values
  ('pp-tech-001', 'cmp-tech-001')
on conflict (company_id) do nothing;
