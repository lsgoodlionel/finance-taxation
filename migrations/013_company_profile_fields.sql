-- 为 companies 表补充联系信息字段
alter table companies
  add column if not exists registered_address text,
  add column if not exists contact_email       text,
  add column if not exists contact_phone       text;
