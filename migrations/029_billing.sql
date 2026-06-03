-- P8-C3 订阅计费：套餐 / 公司订阅 / 支付记录

-- ── 套餐定义 ──────────────────────────────────────────────────────────────────
create table if not exists subscription_plans (
  code           text primary key,         -- free | standard | professional | enterprise
  name           text not null,
  price_monthly  numeric(10,2) not null default 0,
  price_yearly   numeric(10,2) not null default 0,
  limits         jsonb not null default '{}',   -- { seats, employees, aiCallsPerMonth, bankAccounts }（-1=无限）
  features       jsonb not null default '[]',   -- 功能键数组
  highlight      text not null default '',      -- 卖点
  sort_order     int not null default 0
);

-- ── 公司订阅 ──────────────────────────────────────────────────────────────────
create table if not exists company_subscriptions (
  id             text primary key,
  company_id     text not null unique,
  plan_code      text not null default 'free' references subscription_plans(code),
  status         text not null default 'trialing',  -- trialing | active | past_due | canceled
  billing_cycle  text not null default 'monthly',    -- monthly | yearly
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null default now() + interval '30 days',
  trial_end      timestamptz,
  ai_calls_used  int not null default 0,             -- 本周期 AI 调用计数
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 支付记录 ──────────────────────────────────────────────────────────────────
create table if not exists subscription_payments (
  id             text primary key,
  company_id     text not null,
  plan_code      text not null,
  billing_cycle  text not null,
  amount         numeric(10,2) not null default 0,
  method         text not null default 'offline',   -- offline | alipay | wechat
  status         text not null default 'pending',    -- pending | paid | failed
  reference      text not null default '',           -- 流水号/凭据
  period_start   timestamptz,
  period_end     timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_sub_payments_company on subscription_payments(company_id, created_at desc);

-- ── 默认套餐（参照成熟财税 SaaS 分层）──────────────────────────────────────────
insert into subscription_plans (code, name, price_monthly, price_yearly, limits, features, highlight, sort_order) values
  ('free','免费试用',0,0,
   '{"seats":2,"employees":5,"aiCallsPerMonth":30,"bankAccounts":1}',
   '["events","ledger","tax_basic","reports"]',
   '小微初创免费体验核心记账与报税',1),
  ('standard','标准版',99,999,
   '{"seats":5,"employees":30,"aiCallsPerMonth":300,"bankAccounts":3}',
   '["events","ledger","tax_basic","reports","reconciliation","payroll_transfer","invoice_verify"]',
   '成长型企业的对账·代发·发票验真一体化',2),
  ('professional','专业版',299,2999,
   '{"seats":15,"employees":100,"aiCallsPerMonth":1500,"bankAccounts":10}',
   '["events","ledger","tax_basic","reports","reconciliation","payroll_transfer","invoice_verify","ai_agents","social_security","counterparties","cash_forecast"]',
   '全套 AI 财税 Agent + 社保联动 + 资金前瞻',3),
  ('enterprise','旗舰版',899,8999,
   '{"seats":-1,"employees":-1,"aiCallsPerMonth":-1,"bankAccounts":-1}',
   '["events","ledger","tax_basic","reports","reconciliation","payroll_transfer","invoice_verify","ai_agents","social_security","counterparties","cash_forecast","bank_api","multi_org","priority_support"]',
   '银行API直连 · 多组织 · 不限量 · 优先支持',4)
on conflict (code) do nothing;
