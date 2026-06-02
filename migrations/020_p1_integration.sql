-- P1 外部系统对接：发票台账、银行账户、银行流水、申报提交记录
-- Migration: 007_p1_integration

-- ── 1. 发票台账 ───────────────────────────────────────────────────────────────

create table if not exists invoices (
  id               text primary key,
  company_id       text not null,
  direction        text not null default 'input',   -- 'input'进项 | 'output'销项
  invoice_type     text not null default 'vat_special', -- vat_special增专|vat_general增普|electronic电子|receipt收据
  invoice_code     text,                             -- 发票代码（10位/12位）
  invoice_no       text not null,                    -- 发票号码
  invoice_date     date not null,
  seller_name      text not null,
  seller_tax_no    text not null default '',
  buyer_name       text not null default '',
  buyer_tax_no     text not null default '',
  amount           numeric(18,2) not null default 0, -- 不含税金额
  tax_amount       numeric(18,2) not null default 0, -- 税额
  total_amount     numeric(18,2) not null default 0, -- 价税合计
  tax_rate         numeric(6,4) not null default 0,  -- 税率 0.13=13%
  -- 验真状态
  verify_status    text not null default 'pending',  -- pending|verified|invalid|error
  verify_message   text,
  verified_at      timestamptz,
  -- 关联
  business_event_id text,
  document_id       text,
  voucher_id        text,
  -- 元数据
  source           text not null default 'manual',   -- manual手动|ocr识别|import导入
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_invoices_company on invoices(company_id);
create index if not exists idx_invoices_date    on invoices(invoice_date);
create index if not exists idx_invoices_event   on invoices(business_event_id) where business_event_id is not null;
create index if not exists idx_invoices_verify  on invoices(verify_status);

-- ── 2. 银行账户（替代 companies 单字段，支持多账户）────────────────────────────

create table if not exists bank_accounts (
  id           text primary key,
  company_id   text not null,
  bank_name    text not null,
  bank_code    text,              -- 联行号 CNAPS
  account_no   text not null,
  account_name text not null,
  currency     text not null default 'CNY',
  is_primary   boolean not null default false,
  is_payroll   boolean not null default false,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, account_no)
);

create index if not exists idx_bank_accounts_company on bank_accounts(company_id);

-- ── 3. 银行流水 ───────────────────────────────────────────────────────────────

create table if not exists bank_statements (
  id                 text primary key,
  company_id         text not null,
  bank_account_id    text references bank_accounts(id),
  transaction_date   date not null,
  value_date         date,
  -- 正=收款 负=付款
  amount             numeric(18,2) not null,
  balance            numeric(18,2),
  counterparty_name  text,
  counterparty_no    text,
  transaction_ref    text,                     -- 银行流水号（幂等键）
  description        text,
  -- 对账
  match_status       text not null default 'unmatched', -- unmatched|auto|manual|excluded
  matched_voucher_id text,
  matched_event_id   text,
  -- 导入批次
  import_batch       text,
  imported_at        timestamptz not null default now(),
  unique (company_id, transaction_ref)
);

create index if not exists idx_bank_stmts_company on bank_statements(company_id);
create index if not exists idx_bank_stmts_date    on bank_statements(transaction_date);
create index if not exists idx_bank_stmts_match   on bank_statements(match_status);

-- ── 4. 申报提交记录 ───────────────────────────────────────────────────────────

create table if not exists tax_declaration_submissions (
  id              text primary key,
  company_id      text not null,
  tax_type        text not null,        -- 'vat'|'iit'|'cit'|'si'|'housing_fund'
  filing_period   text not null,        -- YYYY-MM
  batch_id        text,                 -- tax_filing_batches.id
  -- 申报模式
  submission_mode text not null default 'manual_file', -- manual_file|api|agent
  -- 生成的申报文件
  file_format     text,                 -- 'xml'|'csv'|'pdf'
  file_name       text,
  file_content    text,                 -- 文件内容（小文件内联存储）
  -- 外部状态
  submission_ref  text,                 -- 电子税务局申报流水号
  status          text not null default 'generated', -- generated|uploaded|confirmed|rejected
  error_message   text,
  submitted_at    timestamptz,
  confirmed_at    timestamptz,
  -- 操作人
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tax_subs_company on tax_declaration_submissions(company_id);
create index if not exists idx_tax_subs_period  on tax_declaration_submissions(filing_period);
create index if not exists idx_tax_subs_status  on tax_declaration_submissions(status);
