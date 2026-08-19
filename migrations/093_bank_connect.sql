-- V14-A：银企直连的凭据配置与提交记录。
--
-- ## 只做框架，不做实际验证
--
-- V13 把银企直连列入「明确不做」，理由是「无真实银行环境无法验证；各行协议
-- 差异大，抽象层写早必返工」。V14 的约束改了：**只做框架与前台配置，
-- 不实际连接**。返工风险因此转移到「适配器实现」那一层，而框架层的形状由
-- 主流银企直连的共性（认证/付款/查状态/查余额）决定。
--
-- ## 证书不落库明文
--
-- `cert_ref` 存的是**引用**（文件路径或密钥库别名），不是证书内容。
-- 密码走 `cert_password_enc`，与既有集成配置同一套加密。前台只显示指纹与
-- 有效期，不回显内容——这是最基本的密钥卫生。
--
-- 把证书内容存进数据库看似方便，但那意味着：数据库备份里有私钥、
-- 任何能读这张表的人都能拿走付款能力、而泄漏之后无法追溯是从哪一份备份流出的。

create table if not exists bank_connect_configs (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,

  -- 适配器标识，与 BankAdapter.provider 对应。**不加 CHECK 枚举**：
  -- 新接一家银行时不该需要一次迁移，而未注册的 provider 由代码层
  -- 返回「该银行尚未接入」，不会静默出错。
  provider        text not null,
  display_name    text not null,

  -- 我方付款账号。一家公司可能有多个户，每个户一条配置。
  payer_account   text not null,

  customer_no     text not null default '',
  endpoint        text not null default '',
  sign_algorithm  text not null default 'RSA' check (sign_algorithm in ('RSA', 'SM2')),

  -- 证书**引用**，不是内容。
  cert_ref        text not null default '',
  cert_password_enc text,
  -- 指纹与有效期供前台展示，不参与签名。
  cert_fingerprint text,
  cert_expires_on  date,

  enabled         boolean not null default false,

  -- 上次连通性测试的结果。测试不发起资金操作，只验凭据。
  last_test_ok    boolean,
  last_test_at    timestamptz,
  last_test_msg   text,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 一个付款账号只配一次。同一个户配两条会让「用哪条」变成靠运气。
  constraint uq_bank_connect_account unique (company_id, payer_account)
);

comment on table bank_connect_configs is
  'V14-A 银企直连配置。**证书存引用不存内容**——存内容意味着数据库备份里有私钥、'
  '任何能读这张表的人都能拿走付款能力，而泄漏后无法追溯从哪份备份流出。';

comment on column bank_connect_configs.provider is
  '适配器标识，与 BankAdapter.provider 对应。**不加 CHECK 枚举**：新接一家银行'
  '不该需要一次迁移；未注册的 provider 由代码层提示「尚未接入」。';

-- 付款指令的提交记录。
--
-- 与 payments 表分开：payments 是**业务上的付款单**（我要付这笔钱），
-- 这张表是**与银行的一次交互**（我把这笔提交给银行了，银行说什么）。
-- 一张付款单可能提交多次（首次超时、重试），每次都要留痕。
create table if not exists bank_transfer_instructions (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  payment_id      text not null references payments(id) on delete restrict,
  config_id       text not null references bank_connect_configs(id) on delete restrict,

  -- 我方流水号，幂等键。同一个 clientRef 重复提交，银行应返回首次结果。
  client_ref      text not null,
  bank_ref        text,

  amount_cents    bigint not null check (amount_cents > 0),
  payee_account   text not null,
  payee_name      text not null,

  status          text not null default 'pending'
                  check (status in ('pending', 'accepted', 'processing', 'succeeded', 'failed', 'unknown')),
  message         text,

  submitted_at    timestamptz,
  last_checked_at timestamptz,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 流水号全局唯一：它是幂等键，重复会让「查状态」查到错误的那一笔。
  constraint uq_bank_instruction_client_ref unique (company_id, client_ref)
);

create index if not exists idx_bank_instructions_payment
  on bank_transfer_instructions (payment_id);

-- 待轮询的指令：已提交但未到终态的。
create index if not exists idx_bank_instructions_pending
  on bank_transfer_instructions (company_id, status)
  where status in ('accepted', 'processing', 'unknown');

comment on table bank_transfer_instructions is
  'V14-A 付款指令提交记录。**与 payments 分开**：payments 是业务上的付款单，'
  '这张表是与银行的一次交互。一张付款单可能提交多次（超时重试），每次都要留痕。';

comment on column bank_transfer_instructions.status is
  '「处理中」既不是成功也不是失败——不映射成布尔。unknown 表示查不到，'
  '可能只是还没同步，不能当失败处理。';
