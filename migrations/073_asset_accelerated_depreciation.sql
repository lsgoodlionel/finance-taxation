-- V12-D4 二期：税法加速折旧。
--
-- 《企业所得税法实施条例》第九十八条：由于技术进步、产品更新换代较快，或常年处于
-- 强震动、高腐蚀状态的固定资产，可以缩短折旧年限或者采取加速折旧的方法。
--
-- - 缩短折旧年限的，**最低折旧年限不得低于第六十条规定年限的 60%**；
-- - 采取加速折旧方法的，可以采用双倍余额递减法或者年数总和法。
--
-- ## 只影响税法口径，不动账簿折旧
--
-- 这两列进的是《资产折旧、摊销及纳税调整明细表》(A105080) 的取数，账簿上每月计提
-- 多少仍由既有的 `depreciation_method` 与 C1 的计提逻辑决定。两者不一致正是纳税
-- 调整存在的理由，所以**不复用** `depreciation_method` 这一列——那一列改了会影响
-- 真实凭证与已过账的历史数据。
--
-- ## 60% 下限为什么做成数据库约束
--
-- 它是一条法定下限，写错了不会报错，只会让企业多扣一笔税前费用——直到稽查时才
-- 发现。应用层 `minimumShortenedLifeMonths` 也会挡，但那只对走应用层的写入有效；
-- 数据修复脚本、批量导入都绕得过去。这类"错了才知道"的规则值得放在库里。
--
-- 取整方向是**向上**（`ceiling`）：电子设备 3 年 × 60% = 21.6 个月，向下取整成 21
-- 会让企业合法地比法定下限多扣一点点。与应用层的 Math.ceil 一致。

alter table fixed_assets
  add column if not exists tax_depreciation_method text not null default 'straight_line',
  add column if not exists tax_life_months_override integer;

alter table fixed_assets
  add constraint fixed_assets_tax_depreciation_method_check
  check (tax_depreciation_method in ('straight_line', 'double_declining', 'sum_of_years'));

-- 缩短年限的下限：法定最低年限 × 60%，向上取整。
-- 类别与年限对应《实施条例》第六十条，与 tax-depreciation.ts 的 TAX_MINIMUM_LIFE_YEARS
-- 一一对应；未列出的类别按覆盖面最广的「器具工具家具」5 年处理。
alter table fixed_assets
  add constraint fixed_assets_shortened_life_check
  check (
    tax_life_months_override is null
    or tax_life_months_override >= ceiling(
      case category
        when 'building' then 20
        when 'equipment' then 10
        when 'vehicle' then 4
        when 'electronic' then 3
        else 5
      end * 12 * 0.6
    )
  );

comment on column fixed_assets.tax_depreciation_method is
  '税法折旧方法（V12-D4 二期）：straight_line / double_declining / sum_of_years。'
  '加速折旧是企业的**选择**而非自动判定——实施条例第九十八条给的是「可以」，'
  '且要满足技术进步 / 强震动高腐蚀等条件，系统判不了。'
  '本列只影响纳税调整明细表的取数，账簿计提仍看 depreciation_method。';

comment on column fixed_assets.tax_life_months_override is
  '缩短后的税法折旧月数（V12-D4 二期）。为空表示不缩短。'
  '下限是法定最低年限的 60%（实施条例第九十八条），由 fixed_assets_shortened_life_check 把关。';
