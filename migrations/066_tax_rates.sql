-- V12-D2：税率主数据表。
--
-- ## 现在的税率是两行 if
--
-- `modules/tax/rules.ts` 的 `resolveVatRate` 全文如下：小规模或简易计税返回
-- "3"，摘要里含「简易」返回 "3"，其余一律返回 "13"。于是：
--
-- 1. **9% 和 6% 产不出来**。交通运输、建筑服务、不动产租赁是 9%，现代服务、
--    金融服务、生活服务是 6%——这两档覆盖了绝大多数服务业企业，它们的
--    增值税底稿现在全按 13% 算，销项税凭空多出一半。
-- 2. **没有时间维度**，这一条比上一条更严重。增值税税率改过两次：
--    17%→16%（2018-05-01）→13%（2019-04-01），11%→10%→9% 同步。
--    用今天的 13% 去算 2018 年的账是错的，而系统连"当时是多少"都无从表达。
-- 3. **小规模纳税人在多缴税**。财政部 税务总局公告 2023 年第 19 号：
--    2023-01-01 至 2027-12-31，适用 3% 征收率的应税销售收入**减按 1% 征收**。
--    系统一律按 3% 算，对小规模客户是实打实的多算。
--
-- ## 征收率与实际征收率是两个字段
--
-- 「按 3% 征收率、减按 1% 征收」是税务底稿的标准表述，两个数都要出现在
-- 申报表上：3% 是法定征收率，1% 是实际征收比例。合成一个字段会让底稿
-- 没法如实列示，也解释不了减征优惠到期后会回到多少。
--
-- ## 免征额不在这张表里
--
-- 小规模月销售额 10 万以下免征——那是**申报期的计算逻辑**（要看当期销售额），
-- 不是税率属性。税率表只回答"这类业务在这个时点适用什么税率"，
-- 把免征判断塞进来会让这张表既是主数据又是规则引擎。

create table if not exists tax_rates (
  id text primary key,
  /** null 表示系统内置税率，全租户共享；非 null 是某公司自定义的税率。 */
  company_id text references companies(id) on delete cascade,

  tax_type text not null,
  /** 稳定的机器标识，代码按它取数；名称可以改，code 不该改。 */
  code text not null,
  name text not null,

  /** 法定税率/征收率，以百分数存：13% 存 13.0000。 */
  rate numeric(6,4) not null,
  /**
   * 实际征收率。null 表示按 rate 全额征收；有值表示减征
   * （如 3% 征收率减按 1% 征收，rate=3、levy_rate=1）。
   */
  levy_rate numeric(6,4),

  /** 适用的纳税人类型；null 表示不限。 */
  taxpayer_type text,
  /** 适用范围的人话说明，直接显示在底稿与税率选择器上。 */
  applicable_scope text not null default '',

  /**
   * 生效区间。`effective_to` 为 null 表示仍然有效。
   *
   * 税率改版时**不改旧行**，而是给旧行封口、插一条新行 —— 旧账要能重算出
   * 当时的数字，改写历史税率等于把已申报的底稿悄悄改掉。
   */
  effective_from date not null,
  effective_to date,

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tax_rates_rate_range check (rate >= 0 and rate <= 100),
  constraint tax_rates_levy_range check (levy_rate is null or (levy_rate >= 0 and levy_rate <= rate)),
  constraint tax_rates_period_order check (effective_to is null or effective_to >= effective_from),
  constraint tax_rates_taxpayer_type check (
    taxpayer_type is null or taxpayer_type in ('general_vat', 'small_scale', 'general_simplified')
  )
);

-- 同一个 code 在同一时点只能有一条生效记录。用 (code, effective_from) 做唯一键
-- 而不是只用 code：同一档税率在历史上有多个版本，这正是这张表存在的意义。
create unique index if not exists uq_tax_rates_code_from
  on tax_rates (coalesce(company_id, ''), tax_type, code, effective_from);
create index if not exists idx_tax_rates_lookup
  on tax_rates (tax_type, taxpayer_type, effective_from);

-- ── 增值税税率沿革 ──────────────────────────────────────────────────
--
-- 系统内置（company_id 为 null）。历史档保留，因为重算旧期间的底稿需要它们。
insert into tax_rates (id, company_id, tax_type, code, name, rate, levy_rate, taxpayer_type, applicable_scope, effective_from, effective_to, sort_order)
values
  -- 基本税率：17% → 16% → 13%
  ('rate-vat-basic-2016', null, 'vat', 'vat_basic', '增值税基本税率 17%', 17, null, 'general_vat',
   '销售货物、加工修理修配劳务、有形动产租赁、进口货物', '2016-05-01', '2018-04-30', 10),
  ('rate-vat-basic-2018', null, 'vat', 'vat_basic', '增值税基本税率 16%', 16, null, 'general_vat',
   '销售货物、加工修理修配劳务、有形动产租赁、进口货物', '2018-05-01', '2019-03-31', 10),
  ('rate-vat-basic-2019', null, 'vat', 'vat_basic', '增值税基本税率 13%', 13, null, 'general_vat',
   '销售货物、加工修理修配劳务、有形动产租赁、进口货物', '2019-04-01', null, 10),

  -- 低税率：11% → 10% → 9%
  ('rate-vat-low-2016', null, 'vat', 'vat_low', '增值税低税率 11%', 11, null, 'general_vat',
   '交通运输、邮政、基础电信、建筑、不动产租赁、销售不动产、转让土地使用权、农产品等', '2016-05-01', '2018-04-30', 20),
  ('rate-vat-low-2018', null, 'vat', 'vat_low', '增值税低税率 10%', 10, null, 'general_vat',
   '交通运输、邮政、基础电信、建筑、不动产租赁、销售不动产、转让土地使用权、农产品等', '2018-05-01', '2019-03-31', 20),
  ('rate-vat-low-2019', null, 'vat', 'vat_low', '增值税低税率 9%', 9, null, 'general_vat',
   '交通运输、邮政、基础电信、建筑、不动产租赁、销售不动产、转让土地使用权、农产品等', '2019-04-01', null, 20),

  -- 6%：营改增以来未变
  ('rate-vat-service-2016', null, 'vat', 'vat_service', '增值税税率 6%', 6, null, 'general_vat',
   '现代服务、金融服务、生活服务、增值电信、销售无形资产', '2016-05-01', null, 30),

  -- 零税率与免税：出口退税与免税项目都要能在底稿上如实列示，不能挤进 6%
  ('rate-vat-zero-2016', null, 'vat', 'vat_zero', '增值税零税率 0%', 0, null, 'general_vat',
   '出口货物、跨境应税行为适用零税率的情形', '2016-05-01', null, 40),

  -- 简易计税征收率 3%（一般纳税人选择简易计税的情形）
  ('rate-vat-simplified-2016', null, 'vat', 'vat_simplified', '简易计税征收率 3%', 3, null, 'general_simplified',
   '一般纳税人选择简易计税的特定应税行为', '2016-05-01', null, 50),

  -- 小规模纳税人征收率：3%，2023-01-01 起减按 1% 征收（财政部 税务总局公告 2023 年第 19 号）
  ('rate-vat-small-2016', null, 'vat', 'vat_small', '小规模纳税人征收率 3%', 3, null, 'small_scale',
   '小规模纳税人应税销售行为', '2016-05-01', '2022-12-31', 60),
  ('rate-vat-small-2023', null, 'vat', 'vat_small', '小规模纳税人征收率 3%（减按 1% 征收）', 3, 1, 'small_scale',
   '小规模纳税人适用 3% 征收率的应税销售收入，2023-01-01 至 2027-12-31 减按 1% 征收', '2023-01-01', '2027-12-31', 60),

  -- 不动产/出租类 5% 征收率
  ('rate-vat-property-2016', null, 'vat', 'vat_property', '征收率 5%', 5, null, null,
   '销售不动产、不动产经营租赁、劳务派遣差额征税等适用 5% 征收率的情形', '2016-05-01', null, 70)
on conflict do nothing;

-- ── 企业所得税 ──────────────────────────────────────────────────────
insert into tax_rates (id, company_id, tax_type, code, name, rate, levy_rate, taxpayer_type, applicable_scope, effective_from, effective_to, sort_order)
values
  ('rate-cit-basic', null, 'cit', 'cit_basic', '企业所得税基本税率 25%', 25, null, null,
   '居民企业基本税率', '2008-01-01', null, 10),
  ('rate-cit-hnte', null, 'cit', 'cit_hnte', '高新技术企业 15%', 15, null, null,
   '国家需要重点扶持的高新技术企业', '2008-01-01', null, 20)
on conflict do nothing;

-- 系统内置税率（company_id is null）需要被所有租户读到，因此 RLS 策略要放行
-- company_id 为 null 的行；写入仍限制在本租户。
alter table tax_rates enable row level security;
drop policy if exists tax_rates_tenant_read on tax_rates;
create policy tax_rates_tenant_read on tax_rates
  for select
  using (company_id is null or company_id = current_setting('app.current_company', true));
drop policy if exists tax_rates_tenant_write on tax_rates;
create policy tax_rates_tenant_write on tax_rates
  for all
  using (company_id = current_setting('app.current_company', true))
  with check (company_id = current_setting('app.current_company', true));

comment on column tax_rates.levy_rate is
  '实际征收率。null 表示按 rate 全额征收；有值表示减征（3% 征收率减按 1% 征收 → rate=3, levy_rate=1）。'
  '两个数都要出现在申报表上，合成一个字段会让底稿没法如实列示。';
