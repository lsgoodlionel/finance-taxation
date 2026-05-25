create table if not exists contract_object_links (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  contract_id text not null references contracts(id) on delete cascade,
  business_event_id text not null references business_events(id) on delete cascade,
  object_type text not null check (object_type in ('task', 'document', 'tax_item', 'voucher')),
  object_id text not null,
  relation_kind text not null default 'event-generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_contract_object_links_unique_object
  on contract_object_links(contract_id, object_type, object_id);

create index if not exists idx_contract_object_links_contract
  on contract_object_links(contract_id, company_id);

create index if not exists idx_contract_object_links_event
  on contract_object_links(business_event_id, company_id);
