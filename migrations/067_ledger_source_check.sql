-- V12 收尾：给 `ledger_entries.source` 加取值约束。
--
-- ## 为什么这一列不能随便写
--
-- 整套结转口径机制都建立在这一列的取值来自已知集合之上：
--
-- - 利润表与驾驶舱要**排除**月末结转分录（`period_closing`），否则结转一做完
--   本期收入就变成 0；
-- - 年结分录（`annual_closing`）要在跨年报表里被单独识别；
-- - 期初建账（`opening_balance`）是真实余额而非结转，排除它会让期初余额从
--   资产负债表上消失。
--
-- 判定全是字符串比较（见 `ledger/closing-sources.ts`）。写错一个字母不会报错，
-- 只会让那条分录**悄悄换一个身份**：本该被排除的进了利润表，或本该计入的被滤掉。
-- 这类失真没有任何提示，只有等到报表数字对不上时才被发现，而那时已经过了几个月。
--
-- ## 关于 NULL
--
-- 这一列本身已是 NOT NULL（001 建表时就是），所以约束里的 `source is null` 分支
-- 实际不可达 —— 保留它是为了让约束表达的是"取值必须来自这个集合"这一条规则本身，
-- 而不隐含依赖另一条约束的存在。
--
-- 代码侧 `closing-sources.ts` 用 `is distinct from` 而非 `<>` 是防御性写法
-- （万一将来放开 NOT NULL，`NULL <> 'x'` 求值为假会静默滤掉全部历史分录）。
-- 两处并不矛盾：数据库保证现在没有 NULL，代码保证将来有 NULL 也不会算错。
--
-- ## 不用外键到一张来源表
--
-- 取值只有四个、由代码常量定义、增加一个就要同时改代码逻辑。CHECK 约束与代码
-- 里的联合类型一一对应，读代码的人一眼能对上；单开一张表反而多一层间接。

do $$
declare
  bad_count bigint;
  bad_values text;
begin
  -- 先看有没有既有脏数据。有的话不静默改写，而是把它们报出来终止迁移：
  -- 这一列的取值决定分录身份，替用户猜一个「大概是 voucher_posting」比报错危险。
  select count(*), string_agg(distinct source, ', ')
    into bad_count, bad_values
  from ledger_entries
  where source is not null
    and source not in ('voucher_posting', 'period_closing', 'annual_closing', 'opening_balance');

  if bad_count > 0 then
    raise exception
      'ledger_entries.source 存在 % 条超出已知集合的取值：%。请先确认这些分录的真实身份并逐条修正，再执行本迁移。',
      bad_count, bad_values;
  end if;
end $$;

alter table ledger_entries
  drop constraint if exists ledger_entries_source_check;

alter table ledger_entries
  add constraint ledger_entries_source_check
  check (
    source is null
    or source in ('voucher_posting', 'period_closing', 'annual_closing', 'opening_balance')
  );

comment on column ledger_entries.source is
  '分录来源，决定它在各类报表里的身份：voucher_posting 业务分录 / period_closing 月末结转 / '
  'annual_closing 年末结转 / opening_balance 期初建账。取值集合与 '
  'modules/ledger/closing-sources.ts 一一对应，增加取值必须同时改那里的判定逻辑。';
