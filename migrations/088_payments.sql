-- V13-C3：付款单。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段四」。
--
-- ## 只管「结算性付款」，不管借款预付
--
-- 付款对象两种：报销单（付给员工）、合同期次（付给供应商）。两者共用一张表
-- 而不是各建一张——付款这个动作本身是同一件事：从某个银行账户转出一笔钱、
-- 生成凭证、留下审计痕迹。分成两张表会让「这个月一共付了多少」变成两个
-- 查询再相加。
--
-- **借款付款不在这里**。它与这两种在会计上性质不同：
--
-- - 报销/合同付款是**负债减少**（借 应付 / 贷 银行存款）
-- - 借款付款是**资产内部转移**（借 其他应收款 / 贷 银行存款）——钱还没花掉
--
-- 强行合成一张表，凭证生成就要按对象类型分叉出一条方向完全不同的分支，
-- 而那正是最容易写反的地方。借款付款走 `advances/payment.ts`（V13-B3）。
--
-- ## 银企直连不做
--
-- 只做到「生成付款指令并导出为银行可导入的格式」。直连依赖具体银行的接口
-- 协议与企业的网银证书，无法在没有真实银行环境的情况下验证；各行协议差异
-- 极大，抽象层写早了必定返工。这一点在蓝图第五节「明确不做的清单」里。

create table if not exists payments (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  payment_no      text not null,

  -- 付款对象二选一。**不建一个多态的 (target_type, target_id)**：
  -- 那样就没法加外键，孤儿引用只能靠护栏扫。两个可空外键列虽然看着松散，
  -- 但每一列的完整性都由数据库保证。
  reimbursement_id text references reimbursements(id) on delete restrict,
  schedule_id      text references contract_payment_schedules(id) on delete restrict,

  amount_cents    bigint not null check (amount_cents > 0),

  -- 付款日，也是凭证的会计日期。
  paid_on         date not null,

  -- 付款账户对应的科目（默认 1002 银行存款）。存科目而不是银行账户 id：
  -- 落账要的是科目，而银行账户与科目的对应关系已经在 bank_accounts 上。
  bank_account_code text not null default '1002',

  status          text not null default 'draft'
                  check (status in ('draft', 'submitted', 'paid', 'cancelled')),

  -- 生成的付款凭证。与其余系统凭证一致：draft，等会计过账。
  voucher_id      text references vouchers(id) on delete set null,

  -- 导出批次号。导出成银行可导入格式时打上，用于对账时反查「这笔是哪一批导出的」。
  export_batch_no text,

  note            text,
  created_by_user_id text not null references users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_payment_no unique (company_id, payment_no),

  -- 两个引用列必须**恰好有一个**非空。
  --
  -- 一个都不填的付款单不知道在付什么；两个都填会让「累计已付」在两处各算一遍。
  constraint payment_exactly_one_target check (
    (case when reimbursement_id is not null then 1 else 0 end)
    + (case when schedule_id is not null then 1 else 0 end)
    = 1
  )
);

-- 按期次汇总累计已付（C5）。这是「不存冗余汇总列」的代价——每次都要
-- 聚合一次，所以索引必须有。
create index if not exists idx_payments_schedule
  on payments (schedule_id) where schedule_id is not null;

create index if not exists idx_payments_reimbursement
  on payments (reimbursement_id) where reimbursement_id is not null;

create index if not exists idx_payments_paid_on
  on payments (company_id, paid_on);

comment on table payments is
  'V13-C3 付款单，只管结算性付款（报销 / 合同期次）。借款付款不在这里——'
  '它是资产内部转移而非负债减少，凭证方向完全不同，合成一张表会让凭证生成'
  '分叉出最容易写反的那种分支。借款走 advances/payment.ts。';

comment on constraint payment_exactly_one_target on payments is
  '两个引用列恰好一个非空。一个都不填不知道在付什么；两个都填会让累计已付'
  '在两处各算一遍。';

comment on column payments.export_batch_no is
  '导出批次号。V13 只做到生成银行可导入格式，**不做银企直连**——直连依赖'
  '各行协议与网银证书，无法在没有真实银行环境时验证。';
