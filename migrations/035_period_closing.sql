-- B2 账务内核：期末结转损益（结转损益 → 本年利润）
-- 结转凭证不对应具体业务事项，放宽相关 NOT NULL；period_closings 记录已结账期做幂等。
alter table vouchers alter column business_event_id drop not null;
alter table vouchers alter column mapping_id drop not null;
alter table ledger_entries alter column business_event_id drop not null;

create table if not exists period_closings (
  id           text primary key,
  company_id   text not null references companies(id),
  period_label text not null,
  voucher_id   text not null references vouchers(id),
  net_profit   numeric(18, 2) not null,
  closed_at    timestamptz not null default now(),
  unique (company_id, period_label)
);
create index if not exists idx_period_closings_company on period_closings(company_id);
