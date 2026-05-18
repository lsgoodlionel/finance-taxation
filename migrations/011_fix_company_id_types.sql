-- Fix: company_id columns in 009 and 010 were incorrectly typed as uuid.
-- All company IDs in this system are text (e.g. 'cmp-tech-001').

alter table audit_logs
  alter column company_id type text using company_id::text;

alter table company_knowledge_items
  alter column company_id type text using company_id::text;
