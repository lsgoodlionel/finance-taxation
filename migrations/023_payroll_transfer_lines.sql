-- P3 工资代发：员工工资账号字段 + 代发批次明细行（账号快照）

-- ── 1. 员工工资发放账号 ────────────────────────────────────────────────────────
alter table employees add column if not exists salary_account text not null default '';
alter table employees add column if not exists salary_bank    text not null default '';

-- ── 2. 代发批次明细行 ──────────────────────────────────────────────────────────
-- 生成批次时把员工账号快照进来，避免事后改号影响历史批次

create table if not exists payroll_transfer_lines (
  id              text primary key,
  batch_id        text not null references payroll_transfer_batches(id) on delete cascade,
  company_id      text not null,

  employee_id     text not null,
  employee_name   text not null,

  -- 账号快照
  salary_account  text not null default '',
  salary_bank     text not null default '',

  -- 实发金额（来自 payroll_records.net_pay）
  amount          numeric(18,2) not null default 0,

  -- 行状态：normal 正常 | skipped 缺账号被跳过
  status          text not null default 'normal',

  created_at      timestamptz not null default now()
);

create index if not exists idx_payroll_transfer_lines_batch on payroll_transfer_lines(batch_id);
create index if not exists idx_payroll_transfer_lines_company on payroll_transfer_lines(company_id);
