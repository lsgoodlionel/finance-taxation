-- 税款缴纳记录（V17 阶段三批次 B）
--
-- 缺口：附加税以**实际缴纳**的增值税为计税依据，而系统里
-- 「这笔增值税实际交了多少、什么时候交的」这个事实没有落点——
-- 申报批次的状态机是 draft → review_required → ready → submitted → archived，
-- 到 submitted 就结束了，不含「已缴纳」，也不存金额。
--
-- 没有这张表，附加税只能按「应纳增值税」估算。而应纳与实缴在有留抵、
-- 有减免、分期缴纳时都不相等——用户会拿这个近似值去申报，
-- 而申报表上的数字必须是准的。

create table if not exists tax_payments (
  id            text primary key,
  company_id    text not null references companies(id),
  -- 税种，与 tax_rates.tax_type 同口径（vat / cit / ...）。
  tax_type      text not null,
  filing_period text not null,
  -- 实缴金额（分）。整数分，不存小数。
  amount_cents  bigint not null,
  -- 实际缴款日。附加税的计税依据按这个日期归期。
  paid_on       date not null,
  -- 缴款对应的凭证。可空——先登记缴款事实、后补凭证是常见顺序。
  voucher_id    text null references vouchers(id),
  note          text not null default '',
  created_by    text null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tax_payments_company_period
  on tax_payments(company_id, tax_type, filing_period);
