-- V12 蓝图第六节第 1 条的落地：给 `vouchers.status` 加取值约束。
--
-- 与迁移 067（`ledger_entries.source`）是同一件事的另一半，当时只做了分录侧。
--
-- ## 待核实项核实结果
--
-- 蓝图记的是「`vouchers/routes.ts` 的排序表达式含 `'validated'` / `'approved'`，
-- 但 `VoucherStatus` 只有 draft|review_required|posted，跑 select distinct 确认」。
--
-- 查下来：种子库里只有 `posted`，**没有脏数据**；但这一列**没有任何 CHECK 约束**，
-- 所以「现在没有」纯属运气，不是保证。排序表达式里那两个类型外的值是早期状态机
-- 的遗留，它们的存在恰恰说明这一列历史上被写过别的取值。
--
-- ## 为什么这一列不能随便写
--
-- 凭证状态决定它能不能过账、能不能被红冲、进不进结账向导的「未过账事项」清单。
-- 判定全是字符串比较，写错一个字母不会报错，只会让这张凭证**从所有这些判定里
-- 消失**——既不算未过账（清不掉）、也不算已过账（进不了账簿），成为一张查不出
-- 原因的幽灵凭证。
--
-- ## 不用枚举类型
--
-- 与 067 同一个理由：取值只有三个、由代码常量定义、增加一个就要同时改代码逻辑。
-- CHECK 与 `VoucherStatus` 联合类型一一对应，读代码的人一眼能对上；PostgreSQL
-- 的 enum 加值要 ALTER TYPE 且不能在事务里回滚，反而更难改。

do $$
declare
  bad_count bigint;
  bad_values text;
begin
  -- 先扫既有脏数据。有的话不静默改写，而是报出来终止：
  -- 状态决定凭证能不能过账，替用户猜一个「大概是 draft」比报错危险得多。
  select count(*), string_agg(distinct status, ', ')
    into bad_count, bad_values
    from vouchers
   where status not in ('draft', 'review_required', 'posted');

  if bad_count > 0 then
    raise exception
      'vouchers.status 有 % 条取值不在 draft/review_required/posted 里：%。'
      '请先确认这些凭证的真实状态再执行本迁移——状态决定它能不能过账，猜错比报错危险。',
      bad_count, bad_values;
  end if;
end $$;

alter table vouchers
  add constraint vouchers_status_check
  check (status in ('draft', 'review_required', 'posted'));

comment on column vouchers.status is
  '凭证状态，取值受 vouchers_status_check 约束，与 domain-model 的 VoucherStatus 一一对应。'
  'draft=草稿、review_required=待复核、posted=已过账。'
  '这一列决定凭证能否过账、能否红冲、进不进结账向导的未过账清单，判定全是字符串比较，'
  '写错一个字母会让它从所有判定里同时消失，成为一张查不出原因的幽灵凭证。';
