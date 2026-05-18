-- Add V1-parity fields to companies table
alter table companies
  add column if not exists credit_code         text,
  add column if not exists legal_representative text,
  add column if not exists bank_name           text,
  add column if not exists bank_account        text;
