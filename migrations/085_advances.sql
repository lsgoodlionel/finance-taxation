-- V13-B3：借款单与备用金。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段一」。
--
-- ## 会计处理：其他应收款，不是费用
--
-- 借款付出去的时候钱还没花掉，只是从公司手里转到员工手里——记
-- 「借 1221 其他应收款-备用金 / 贷 1002 银行存款」。等报销时才转成费用。
--
-- 把借款直接记成费用是常见错法：那样员工没花完退回来的钱就成了「负费用」，
-- 而且期末挂账的备用金在报表上凭空消失。
--
-- ## 冲销复用 V12-C2 的往来核销，不自己记一套
--
-- `1221` 的 `account_type` 是 `asset_receivable`，本就在核销机制的覆盖范围内。
-- 于是「这笔借款还剩多少没还」由核销余额算出来，**advances 表不重复记这个数**——
-- 两处各记一份，迟早对不上，而对不上时没人知道该信哪个。
--
-- 员工作为往来单位存进 `counterparties`（category = 'employee'）：那张表没有
-- 类型约束，而员工借款在会计上确实就是一笔对个人的往来。

create table if not exists advances (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  advance_no      text not null,

  -- 关联的申请单。**可空**：借款既可以由用款申请派生，也可以独立发起
  --（临时备用金），强制关联会让后者提不上来。
  request_id      text references requests(id) on delete set null,

  borrower_user_id text not null references users(id) on delete restrict,

  -- 借款人对应的往来单位。落账与核销都用它——没有它，1221 上的分录就分不出
  -- 是谁借的，账龄表上只剩一个总数。
  counterparty_id text not null references counterparties(id) on delete restrict,

  amount_cents    bigint not null check (amount_cents > 0),
  purpose         text not null default '',

  -- 预计归还日。逾期未还的备用金要能捞出来催——这是备用金管理的核心动作。
  expected_return_date date,

  status          text not null default 'draft'
                  check (status in ('draft', 'pending', 'approved', 'paid', 'settled', 'cancelled')),

  -- 付款凭证。付款后回填，是「钱真的出去了」的凭据。
  payment_voucher_id text references vouchers(id) on delete set null,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_advance_no unique (company_id, advance_no),

  -- 已付款的借款必须有付款凭证。没有凭证的「已付款」意味着账上没这笔钱出去，
  -- 而系统却认为员工欠着公司——两边对不上时，这条约束能指出是哪一步漏了。
  constraint advance_paid_requires_voucher check (
    status not in ('paid', 'settled') or payment_voucher_id is not null
  )
);

create index if not exists idx_advances_borrower
  on advances (company_id, borrower_user_id, status);

-- 逾期未还的备用金：按预计归还日捞。**不建部分索引**（`where status = 'paid'`）——
-- 催收要看的是「已付款且没结清」，而结清与否由核销余额决定、不在本表上，
-- 部分索引会给人一种「status 就是真相」的错觉。
create index if not exists idx_advances_return_date
  on advances (company_id, expected_return_date);

comment on table advances is
  'V13-B3 借款单/备用金。付款时记「借 1221 其他应收款 / 贷 1002 银行存款」，'
  '报销时用往来核销冲减——**本表不记「还剩多少没还」**，那个数由核销余额算，'
  '两处各记一份迟早对不上。';

comment on column advances.status is
  'settled 表示业务上已结清，但**真相以核销余额为准**：本字段是流程状态，'
  '不是账务状态。判断某笔借款还剩多少，查 1221 上该往来单位的未核销余额。';

comment on column advances.counterparty_id is
  '借款人对应的往来单位（category = employee）。落账与核销都靠它分户——'
  '没有它，1221 上只剩一个总数，分不出是谁借的。';
