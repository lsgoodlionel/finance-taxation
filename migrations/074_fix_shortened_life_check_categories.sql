-- 修正迁移 073 的 `fixed_assets_shortened_life_check`：漏了三个资产类别。
--
-- ## 漏在哪
--
-- 073 的 CASE 只列了 building / equipment / vehicle / electronic，其余走 `else 5`。
-- 但 `tax-depreciation.ts` 的 TAX_MINIMUM_LIFE_YEARS 还有三个：
--
--   machinery  10 年（飞机、火车、轮船、机器、机械和其他生产设备）
--   tools       5 年
--   furniture   5 年
--
-- `tools` / `furniture` 恰好都是 5 年，落到 else 不影响结果。**`machinery` 是错的**：
-- 法定最低 10 年，缩短下限应为 72 个月，而 073 按 else 的 5 年算成 36 个月 ——
-- 约束比法规宽了一倍，能放行一个违规值。
--
-- 073 的注释还写着「与 TAX_MINIMUM_LIFE_YEARS 一一对应」，那句话当时就不成立。
--
-- ## 影响范围
--
-- 应用层 `minimumShortenedLifeMonths` 读的是 TAX_MINIMUM_LIFE_YEARS，一直算得对，
-- 所以走 API 建卡的路径不受影响。漏的是绕过应用层的写入（数据修复脚本、批量导入）
-- —— 而那正是当初把这条规则放进数据库的理由。
--
-- ## 为什么新开一个迁移而不是改 073
--
-- 073 已经合并进 main，其他环境可能已经执行过。迁移是只进不退的历史，改已执行过的
-- 文件会让不同环境的库悄悄分叉。

alter table fixed_assets drop constraint if exists fixed_assets_shortened_life_check;

-- 先看有没有已经存进来的违规值。有的话报出来终止，而不是让 add constraint 抛一句
-- 不带上下文的错——这一列的违规值意味着某个资产的税前扣除算多了。
do $$
declare
  bad_count bigint;
  bad_rows text;
begin
  select count(*), string_agg(asset_no || '（' || category || '，' || tax_life_months_override || ' 个月）', '、')
    into bad_count, bad_rows
    from fixed_assets
   where tax_life_months_override is not null
     and tax_life_months_override < ceiling(
       case category
         when 'building' then 20
         when 'machinery' then 10
         when 'equipment' then 10
         when 'tools' then 5
         when 'furniture' then 5
         when 'vehicle' then 4
         when 'electronic' then 3
         else 5
       end * 12 * 0.6
     );

  if bad_count > 0 then
    raise exception
      -- 字面百分号要写 %%，否则 RAISE 会把「60%」的 % 当成占位符而报
      -- `too few parameters specified for RAISE`（初版就是这么挂的）。
      '有 % 项资产的缩短折旧年限低于法定下限（实施条例第九十八条：不低于最低年限的 60%%）：%。'
      '这些资产的税前扣除算多了，请先确认正确年限再执行本迁移。',
      bad_count, bad_rows;
  end if;
end $$;

alter table fixed_assets
  add constraint fixed_assets_shortened_life_check
  check (
    tax_life_months_override is null
    or tax_life_months_override >= ceiling(
      case category
        when 'building' then 20
        when 'machinery' then 10
        when 'equipment' then 10
        when 'tools' then 5
        when 'furniture' then 5
        when 'vehicle' then 4
        when 'electronic' then 3
        else 5
      end * 12 * 0.6
    )
  );
