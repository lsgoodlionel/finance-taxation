-- P2 外部系统对接配置表
-- 统一存储各类外部接口配置（发票验真、银行直连、社保API等）

create table if not exists integration_configs (
  id           text primary key,
  company_id   text not null,

  -- 对接类型
  config_type  text not null,   -- 'invoice_verify'|'bank_api'|'si_api'

  -- 服务商
  provider     text not null default 'local',
  -- invoice_verify: local|baiwang|nuonuo|etax_nsrsbh|custom
  -- bank_api:       none|cmb|icbc|ccb|custom
  -- si_api:         local|etax|si_portal|custom

  -- 认证信息（加密存储，读取时脱敏）
  api_key      text,
  api_secret   text,
  app_id       text,            -- 部分平台需要 appId（百望/诺诺）

  -- 接口地址（provider=custom 时必填；其他内置默认值）
  endpoint_url text,

  -- 额外参数（JSON，如区域代码、税号等）
  extra_config jsonb default '{}',

  -- 状态
  enabled      boolean not null default true,
  -- 最近测试结果
  last_test_ok    boolean,
  last_test_at    timestamptz,
  last_test_msg   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (company_id, config_type)
);

create index if not exists idx_integration_configs_company on integration_configs(company_id);

-- 发票验真统计视图（方便前端展示）
-- 直接查 invoices 表统计即可，不额外建视图
