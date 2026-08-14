-- V12-D5：多币种最小版本。
--
-- ## 范围与取舍
--
-- 蓝图给 D5 的触发条件是「出现真实外币业务客户」。没有需求方时，「最小版本」的
-- 边界只能靠取舍原则来定，这里选的是**最保守且能形成闭环**的一组：
--
-- | 决定 | 理由 |
-- |---|---|
-- | 记账本位币固定 CNY | 多本位币要把整套报表按不同本位币重算，超出「最小」 |
-- | 汇率手工维护，不接外部 API | 用央行中间价还是银行牌价是企业的会计政策；外部依赖还会让离线部署失效 |
-- | 分录保留原币三元组，本位币仍进 debit/credit | **报表零改动** —— 这是能把范围压住的关键 |
-- | 期末调汇只做货币性项目 | 准则 19 号第十二条的要求，不是简化 |
--
-- ## 汇率为什么用整数
--
-- `numeric(18,6)` 也能表达，但折算要在应用层做（要按分四舍五入），来回转换容易
-- 在某一处漏掉标度。统一成「乘 1e6 的整数」，应用层 RATE_SCALE 与库里一致，
-- 折算只有一个入口 `convertToBaseCents`。

create table if not exists exchange_rates (
  id           text primary key,
  company_id   text not null references companies(id) on delete cascade,
  -- ISO 4217 三字母码。不建币种主表：取值来自外部标准、不由本系统定义，
  -- 单开一张表只会多一层要同步的间接。
  currency     text not null,
  rate_date    date not null,
  -- 1 外币 = rate / 1e6 本位币。
  rate         bigint not null check (rate > 0),
  -- 汇率来源。手工录入时记录经办人的说明，将来接央行 API 时记接口名与批次。
  -- 汇率是会计政策的一部分，"这个数从哪来的"在稽查时要答得出来。
  source       text not null default 'manual',
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 同一天同一币种只能有一个汇率。要改就改这一行，而不是插入第二行让取数
  -- 靠 order by 撞运气。
  constraint uq_exchange_rates_company_currency_date unique (company_id, currency, rate_date),
  -- 本位币不需要汇率。允许录入 CNY=1 看似无害，但会让「查不到汇率」与
  -- 「汇率是 1」两种情形在取数时混淆。
  constraint exchange_rates_not_base_currency check (currency <> 'CNY')
);

create index if not exists idx_exchange_rates_lookup
  on exchange_rates (company_id, currency, rate_date desc);

-- ── 分录与凭证行保留原币信息 ────────────────────────────────────────
--
-- `debit` / `credit` 仍然是**本位币**金额，所以全部报表、试算平衡、结转损益
-- 一行都不用改。原币三列是附加信息，只在外币业务与调汇底稿上用到。
--
-- currency 默认 CNY、rate 默认 1e6：既有分录全部落在本位币上，语义正确。
alter table ledger_entries
  add column if not exists currency text not null default 'CNY',
  add column if not exists original_amount numeric(18,2),
  add column if not exists exchange_rate bigint;

alter table voucher_lines
  add column if not exists currency text not null default 'CNY',
  add column if not exists original_amount numeric(18,2),
  add column if not exists exchange_rate bigint;

alter table voucher_draft_lines
  add column if not exists currency text not null default 'CNY',
  add column if not exists original_amount numeric(18,2),
  add column if not exists exchange_rate bigint;

-- 外币分录必须三样齐全：币种不是 CNY 就得有原币金额和汇率，否则这笔分录
-- 无法参与调汇，也无法回答"当初按什么汇率入的账"。
-- 本位币分录反过来：不该带原币信息，否则调汇取数时会把它当外币处理。
alter table ledger_entries
  add constraint ledger_entries_currency_consistency
  check (
    (currency = 'CNY' and original_amount is null and exchange_rate is null)
    or (currency <> 'CNY' and original_amount is not null and exchange_rate is not null and exchange_rate > 0)
  );

alter table voucher_lines
  add constraint voucher_lines_currency_consistency
  check (
    (currency = 'CNY' and original_amount is null and exchange_rate is null)
    or (currency <> 'CNY' and original_amount is not null and exchange_rate is not null and exchange_rate > 0)
  );

comment on column ledger_entries.currency is
  '原币种（V12-D5）。debit/credit 始终是本位币 CNY 金额，本列与 original_amount、'
  'exchange_rate 一起记录折算前的事实，供期末调汇与凭证追溯使用。';

comment on table exchange_rates is
  '汇率主数据（V12-D5）。rate 是「1 外币 = rate/1e6 本位币」的整数表示，'
  '与应用层 currency/revaluation.ts 的 RATE_SCALE 一致。'
  '同一天同一币种唯一——要改就改那一行，不要靠插入第二行 + order by 撞运气。';
