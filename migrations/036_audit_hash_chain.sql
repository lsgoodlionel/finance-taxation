-- 审计留痕防篡改哈希链：给 audit_logs 追加 prev_hash / entry_hash 两列。
-- 幂等：可在已存在旧版 audit_logs 的环境重复执行。
alter table audit_logs add column if not exists prev_hash text;
alter table audit_logs add column if not exists entry_hash text;
