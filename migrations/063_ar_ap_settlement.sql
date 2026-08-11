-- V12-C2：往来核算维度与逐笔核销。
--
-- ## 账龄做不出来的根因
--
-- `counterparty_id` 目前只挂在 business_events 上，**总账分录里没有往来单位**。
-- 于是「应收账款 1122」在账上只是一个科目余额合计：知道客户一共欠 380 万，
-- 不知道是哪家欠的、欠了多久、哪几笔已经超过信用账期。催收、坏账准备、
-- 现金流预测全都无从下手 —— 这不是少一张报表，是往来账根本没有明细。
--
-- ## 逐笔核销（open item），不是余额核销
--
-- 两种做法：
--   a) 余额核销：只记「这个客户还欠多少」，收款直接冲减总额；
--   b) 逐笔核销：每笔应收独立存活，收款时指明冲销哪几笔。
--
-- 账龄只有 (b) 做得出来 —— (a) 里收到一笔钱之后，没人知道冲掉的是三个月前
-- 那笔还是上周那笔，而这两者的账龄天差地别。ERPNext 与 Odoo 都是 (b)，
-- GnuCash 用 lot 也是同一思路。代价是多一张核销表，值得。
--
-- ## 超额核销由触发器堵，不靠应用层
--
-- 「收款 10 万却核销掉 12 万的应收」会让这笔应收变成负余额，账龄表上凭空
-- 出现一个负数客户。跨行聚合的约束写不成 CHECK，所以用触发器 —— 应用层
-- 的检查会被下一个调用方绕过，而触发器不会。

-- ── 一、总账与凭证行的往来维度 ──────────────────────────────────────
--
-- 可空：绝大多数分录（费用、税金、结转）没有往来单位，强制非空会逼着
-- 每个调用方编一个假值。往来科目是否必须有往来单位，由应用层按
-- account_type 判断，不在这一层一刀切。
alter table ledger_entries add column if not exists counterparty_id text;
alter table voucher_lines add column if not exists counterparty_id text;

-- 不加外键到 counterparties：往来单位可能在分录写入后才补建档案，
-- 外键会让「先记账后建档」这个非常常见的顺序直接失败。
-- 孤儿 id 的代价是账龄表上显示一个查不到名字的往来单位，可查可修；
-- 外键的代价是记账被挡住。
create index if not exists idx_ledger_entries_counterparty
  on ledger_entries (company_id, counterparty_id, account_code)
  where counterparty_id is not null;

-- ── 二、核销记录 ────────────────────────────────────────────────────
create table if not exists ar_ap_settlements (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,

  -- 被核销的原始分录：应收的借方 / 应付的贷方
  open_entry_id text not null references ledger_entries(id) on delete cascade,
  -- 核销来源分录：收款的贷方 / 付款的借方
  settle_entry_id text not null references ledger_entries(id) on delete cascade,

  amount numeric(18,2) not null,
  settled_on date not null,
  created_at timestamptz not null default now(),
  created_by text,

  constraint ar_ap_settlements_amount_positive check (amount > 0),
  -- 自己核销自己会让余额凭空减半
  constraint ar_ap_settlements_distinct_entries check (open_entry_id <> settle_entry_id)
);

-- 同一对分录只核销一次；要改金额就先删再建，而不是插第二条。
create unique index if not exists uq_ar_ap_settlements_pair
  on ar_ap_settlements (open_entry_id, settle_entry_id);
create index if not exists idx_ar_ap_settlements_open on ar_ap_settlements (open_entry_id);
create index if not exists idx_ar_ap_settlements_settle on ar_ap_settlements (settle_entry_id);

-- ── 三、超额核销的两道闸 ────────────────────────────────────────────
--
-- 分录金额取 debit + credit：往来分录只会有一侧非零（047 的
-- `check (debit = 0 or credit = 0)` 保证了这一点），相加即得该笔金额，
-- 不必再判断这是应收还是应付。
create or replace function ar_ap_settlement_guard() returns trigger as $$
declare
  open_amount numeric(18,2);
  settle_amount numeric(18,2);
  open_used numeric(18,2);
  settle_used numeric(18,2);
begin
  select debit + credit into open_amount from ledger_entries where id = new.open_entry_id;
  select debit + credit into settle_amount from ledger_entries where id = new.settle_entry_id;

  select coalesce(sum(amount), 0) into open_used
  from ar_ap_settlements where open_entry_id = new.open_entry_id and id <> new.id;

  select coalesce(sum(amount), 0) into settle_used
  from ar_ap_settlements where settle_entry_id = new.settle_entry_id and id <> new.id;

  if open_used + new.amount > open_amount then
    raise exception '核销金额超出原始分录余额：分录 % 金额 %，已核销 %，本次 %',
      new.open_entry_id, open_amount, open_used, new.amount
      using errcode = 'check_violation';
  end if;

  -- 收款方向同样不能被超额使用：一笔 10 万的收款不能核销出 12 万的应收。
  if settle_used + new.amount > settle_amount then
    raise exception '核销金额超出收付款分录余额：分录 % 金额 %，已使用 %，本次 %',
      new.settle_entry_id, settle_amount, settle_used, new.amount
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ar_ap_settlement_guard on ar_ap_settlements;
create trigger trg_ar_ap_settlement_guard
  before insert or update on ar_ap_settlements
  for each row execute function ar_ap_settlement_guard();

-- 租户隔离，与 039 同一套策略。
alter table ar_ap_settlements enable row level security;
drop policy if exists ar_ap_settlements_tenant_isolation on ar_ap_settlements;
create policy ar_ap_settlements_tenant_isolation on ar_ap_settlements
  for all
  using (company_id = current_setting('app.current_company', true))
  with check (company_id = current_setting('app.current_company', true));

comment on column ledger_entries.counterparty_id is
  '往来核算维度。往来科目（account_type 为 asset_receivable / liability_payable 等）'
  '的分录应带上它，否则该笔进不了账龄表。非往来科目留空。';
