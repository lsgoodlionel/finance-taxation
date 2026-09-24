-- 应税行为类别：增值税税率判定的信息基础（V17 阶段一）
--
-- ## 为什么需要新的一层分类
--
-- `resolveVatRate` 此前对一般纳税人一律返回 13%，不看业务性质。
-- 一家做咨询服务的公司（应适用 6%）会被按 13% 算，多算一倍还多。
--
-- 想按业务性质判，却发现**判定所需的信息本身不存在**：
--   - `companies` 没有行业字段
--   - `business_events.type`（sales / procurement / expense…）是**记账口径**，
--     与税目无关。一笔 sales 可能是卖货 13%、卖服务 6%、卖不动产 9%
--
-- 拿记账分类去推税目，等于用一个维度回答另一个维度的问题。
--
-- ## 两层来源，不是一层
--
--   - 公司级 `default_taxable_category`：主营业务的类别，做**兜底**
--   - 事项级 `taxable_category`：这一笔的类别，**优先**于公司默认值
--
-- 两个都可空。**空 = 未确定，不是「按默认档算」**——
-- 税率判定拿不到类别时不猜，底稿上显示「税目待确认」并把该笔排除在合计外
-- （复用 V16 增值税 NaN 那次建立的 incompleteTaxItemIds 机制）。
--
-- 政策依据与完整的类别清单见 docs/v17-tax-rate-policy/POLICY-MAP.md。

alter table companies
  add column if not exists default_taxable_category text null;

alter table business_events
  add column if not exists taxable_category text null;

-- 税项也要带：底稿是按税项算税的，类别得跟着事项传到税项上，
-- 否则每算一次税都要回头 join 事项表——而有些税项本来就没有事项
-- （V16 放开过这条约束）。
alter table tax_items
  add column if not exists taxable_category text null;

comment on column companies.default_taxable_category is
  '公司主营的应税行为类别，作为事项未指明时的兜底。null = 没配，此时税率判定报「待确认」。';
comment on column tax_items.taxable_category is
  '这条税项的应税行为类别，生成时从事项带过来。null = 未确定，'
  '底稿回退到公司主营类别；公司也没配就报「税目待确认」，不猜一个默认档。';
comment on column business_events.taxable_category is
  '这一笔业务的应税行为类别（税目口径，与记账口径的 type 不是一回事）。'
  'null = 未确定，回退到公司默认值；公司也没配就报「待确认」，不猜。';

-- 种子公司按其实际业务补上默认类别，让既有数据能算出正确税率。
-- 只填得出来的：填不出来的保持 null，那是事实。
update companies set default_taxable_category = 'modern_service'
 where id = 'cmp-v4-service' and default_taxable_category is null;
update companies set default_taxable_category = 'goods'
 where id = 'cmp-v4-tech' and default_taxable_category is null;
