create table if not exists tax_filing_batch_reviews (
  id                 text primary key,
  company_id         text not null,
  batch_id           text not null references tax_filing_batches(id) on delete cascade,
  reviewed_by_user_id text,
  reviewed_by_name   text not null,
  review_result      text not null,
  review_notes       text not null default '',
  reviewed_at        timestamptz not null
);

create index if not exists idx_tax_filing_batch_reviews_batch
  on tax_filing_batch_reviews(batch_id, reviewed_at desc);

create table if not exists tax_filing_batch_archives (
  id                 text primary key,
  company_id         text not null,
  batch_id           text not null references tax_filing_batches(id) on delete cascade,
  archived_by_user_id text,
  archived_by_name   text not null,
  archive_label      text not null,
  archive_notes      text not null default '',
  archived_at        timestamptz not null
);

create index if not exists idx_tax_filing_batch_archives_batch
  on tax_filing_batch_archives(batch_id, archived_at desc);
