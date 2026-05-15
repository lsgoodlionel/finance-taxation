-- Sprint F-1: 企业制度库与知识库
create table if not exists company_knowledge_items (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  category            text not null,   -- regulation | policy | faq | template
  title               text not null,
  content             text not null,
  tags                text[] not null default '{}',
  is_active           boolean not null default true,
  created_by_user_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_knowledge_company
  on company_knowledge_items(company_id, is_active, category);

create index if not exists idx_knowledge_search
  on company_knowledge_items
  using gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'')));
