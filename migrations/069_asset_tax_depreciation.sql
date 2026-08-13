-- V12-D4：固定资产的税法口径字段。
--
-- ## 会计折旧不等于税前可扣除的折旧
--
-- C1 的 `fixed_assets` 记的全是**会计口径**：企业自己估的使用年限、直线法。
-- 所得税汇算要的是税法口径，两者规则不同，差额要在《A105080 资产折旧、摊销
-- 及纳税调整明细表》上逐项调整。缺了税法口径，汇算只能靠手工台账在表外算，
-- 而手工台账正是最容易与账面脱节的东西。
--
-- ## 只加两个字段
--
-- 税法年限**不存**：它由资产类别按实施条例第六十条推出（见
-- `assets/tax-depreciation.ts` 的 TAX_MINIMUM_LIFE_YEARS），存一份副本只会
-- 与法规脱节——法规改了要改代码，存下来的旧值还得逐条迁移。类别变了年限
-- 自动跟着变，这是派生数据该有的样子。
--
-- 存的是**企业的选择**与**税法特有的属性**，这两样推不出来：
--
-- 1. `elects_one_time_deduction` —— 一次性扣除是**可以放弃的优惠**。亏损企业
--    往往选择不用（当年扣了也抵不了税，反而少了以后年度的扣除额）。
--    自动判定会替企业做决定。
-- 2. `tax_category` —— 税法上的资产分类可能与会计管理用的分类不同
--    （会计按用途分「办公设备/车间设备」，税法只问是不是「机器设备」）。
--    留空时回落到 `category`。

alter table fixed_assets
  add column if not exists elects_one_time_deduction boolean not null default false;

alter table fixed_assets
  add column if not exists tax_category text;

comment on column fixed_assets.elects_one_time_deduction is
  '是否选择一次性税前扣除（财税〔2018〕54 号，延续至 2027-12-31）。'
  '这是企业的选择而非自动判定——亏损企业往往放弃该优惠。';

comment on column fixed_assets.tax_category is
  '税法资产分类，用于查最低折旧年限；留空时回落到 category。'
  '税法年限本身不落库：它由类别按实施条例第六十条推出，存副本只会与法规脱节。';

-- 一次性扣除只适用于 500 万以下的设备器具。房屋建筑物在应用层被排除
-- （见 tax-depreciation.ts），这里用约束把金额这一条钉死：
-- 超过 500 万还勾了一次性扣除，是录入错误而不是可接受的输入。
alter table fixed_assets
  drop constraint if exists fixed_assets_one_time_deduction_limit;

alter table fixed_assets
  add constraint fixed_assets_one_time_deduction_limit
  check (
    not elects_one_time_deduction
    or original_cost <= 5000000
  );
