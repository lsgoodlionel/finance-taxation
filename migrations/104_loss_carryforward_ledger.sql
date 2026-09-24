-- 以前年度亏损台账（V17 阶段三批次 C）
--
-- 缺口：批次 A 把本期亏损带出来了（不再被 Math.max(x, 0) 抹平），
-- 但系统里没有以前年度亏损的台账——只知道「今年亏了多少」，
-- 不知道「前几年还剩多少可以补」。
--
-- 后果：盈利年度的应纳税所得额一分不减，企业按全额缴税，
-- 而企业所得税法第十八条给的弥补权利用不上。

create table if not exists loss_carryforward_ledger (
  id           text primary key,
  company_id   text not null references companies(id),
  -- 亏损所属年度。
  loss_year    integer not null,
  -- 该年度的亏损额（分，正数）。
  loss_cents   bigint not null,
  -- 已在以后年度弥补掉的金额（分）。
  --
  -- 存「已弥补额」而不是「剩余额」：剩余是算出来的，而已弥补额是
  -- 一笔笔累加的事实。存算出来的值意味着每次弥补都要回写，
  -- 中途出错就对不上账。
  offset_cents bigint not null default 0,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 一家公司一个年度只有一条台账。
  unique (company_id, loss_year)
);

create index if not exists idx_loss_ledger_company
  on loss_carryforward_ledger(company_id, loss_year);
