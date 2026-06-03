-- P8-C2 性能索引：覆盖待办收件箱 / 月度结账 / 往来画像等高频聚合过滤

-- 待办收件箱 & 月度结账
create index if not exists idx_invoices_verify         on invoices(company_id, verify_status);
create index if not exists idx_invoices_direction      on invoices(company_id, direction);
create index if not exists idx_gen_docs_status         on generated_documents(company_id, status);
create index if not exists idx_bank_stmts_match        on bank_statements(company_id, match_status);
create index if not exists idx_tasks_status            on tasks(company_id, status);
create index if not exists idx_tasks_due               on tasks(company_id, due_at);

-- 凭证按期/状态（月结凭证过账判定）
create index if not exists idx_vouchers_company_status on vouchers(company_id, status);

-- 税务申报按期
create index if not exists idx_tax_subs_company_period on tax_declaration_submissions(company_id, filing_period);

-- 工资按期（结账/代发/社保聚合）
create index if not exists idx_payroll_company_period   on payroll_records(company_id, period);
