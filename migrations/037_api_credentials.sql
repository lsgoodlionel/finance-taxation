-- D6 开放能力：API Key 与 Webhook 端点持久化
-- api_credentials 只存 key 的哈希（sha256），明文仅在生成时一次性返回，不落库。
create table if not exists api_credentials (
  id           text primary key,
  company_id   text not null references companies(id),
  name         text not null default '',
  key_prefix   text not null,
  key_hash     text not null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index if not exists idx_api_credentials_company on api_credentials(company_id);

-- webhook_endpoints 存 HMAC 签名密钥（secret），用于 signWebhook/verifyWebhookSignature。
create table if not exists webhook_endpoints (
  id           text primary key,
  company_id   text not null references companies(id),
  event_type   text not null,
  target_url   text not null,
  secret       text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_webhook_endpoints_company on webhook_endpoints(company_id);
