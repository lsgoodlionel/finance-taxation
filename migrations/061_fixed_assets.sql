-- V12-C1 固定资产台账与折旧明细。
--
-- ## 修的是什么
--
-- `grep -ri "fixed_asset|折旧" apps/api/src/modules` 只命中一处：月结计划里
-- 「计提折旧」这一步，而它的数据来源注释诚实地写着：
--
--   "当前 schema 无折旧凭证类型/表，无法可靠取得，默认 false"
--
-- 也就是说月结第 2 步永远卡在"待人工确认"，且固定资产从买入那天起就再没有
-- 任何账务动作 —— 资产不折旧，费用不入账，利润虚高，资产净值虚高。这对任何
-- 有设备的企业都是持续性错账，不是缺功能。
--
-- ## 两张表的分工
--
-- `fixed_assets` 是台账（资产是什么），`fixed_asset_depreciations` 是每期
-- 计提明细（这个月提了多少、进了哪张凭证）。折旧明细独立成表而不是只靠
-- ledger_entries 反查，原因是**同一张折旧凭证会汇总多个资产**：凭证只到
-- "管理费用-折旧 12345.67"这一层，回答不了"这台设备累计提了多少"，
-- 而资产处置时恰恰必须知道单个资产的累计折旧。
--
-- ## 累计折旧不落台账列
--
-- 台账上**不设** accumulated_depreciation 列，累计数一律由折旧明细汇总得出。
-- 冗余列会与明细表构成两个事实来源，红冲一张折旧凭证后总有一个忘记回滚。
-- 单个资产的明细行数上限是使用月数（几十行），汇总代价可以忽略。

create table if not exists fixed_assets (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  asset_no text not null,
  name text not null,
  category text not null default 'equipment',

  acquired_on date not null,
  original_cost numeric(18,2) not null,
  salvage_value numeric(18,2) not null default 0,
  useful_life_months integer not null,

  -- 目前只支持直线法。留 check 而不是留注释：将来加双倍余额递减时，
  -- 忘了改这里的代码会在写入端就报错，而不是静默按直线法算。
  depreciation_method text not null default 'straight_line',

  -- 开始计提折旧的期间。中国准则「当月增加当月不提，次月起提」体现在
  -- 建卡时把它算成购置次月，而不是每次计算时再判断一遍。
  -- 存量资产迁入时可以更早（对应它在旧账里的实际开始期），故不强制等于购置次月。
  depreciation_start_period text not null,

  -- 三个科目落脚点。默认值给最常见的情形，制造业的车间设备需显式传
  -- expense_account_code = 制造费用，故不设默认。
  asset_account_code text not null default '1601',
  accumulated_account_code text not null default '1602',
  expense_account_code text not null,

  status text not null default 'in_use',
  disposed_on date,
  disposed_period text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fixed_assets_cost_positive check (original_cost > 0),
  constraint fixed_assets_salvage_range check (salvage_value >= 0 and salvage_value <= original_cost),
  constraint fixed_assets_life_positive check (useful_life_months > 0),
  constraint fixed_assets_method check (depreciation_method in ('straight_line')),
  constraint fixed_assets_status check (status in ('in_use', 'disposed')),
  constraint fixed_assets_start_period_shape check (depreciation_start_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint fixed_assets_disposed_period_shape check (
    disposed_period is null or disposed_period ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  -- 状态与处置日期不得各说各话。少了这条，一次漏更新就能造出
  -- "status = 'in_use' 但 disposed_on 有值"的资产：折旧照提，报表却当它已处置。
  constraint fixed_assets_disposal_consistent check (
    (status = 'disposed') = (disposed_on is not null)
    and (disposed_on is null) = (disposed_period is null)
  )
);

create unique index if not exists uq_fixed_assets_no on fixed_assets (company_id, asset_no);
create index if not exists idx_fixed_assets_company_status on fixed_assets (company_id, status);

create table if not exists fixed_asset_depreciations (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  asset_id text not null references fixed_assets(id) on delete cascade,
  period text not null,
  amount numeric(18,2) not null,
  -- 计提凭证。凭证被删（草稿撤回）时置空而不是连带删明细 —— 明细要留痕，
  -- 由重新计提覆盖，否则"这个月到底提没提过"的历史就断了。
  voucher_id text references vouchers(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint fixed_asset_depreciations_amount_nonneg check (amount >= 0),
  constraint fixed_asset_depreciations_period_shape check (period ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- 一个资产一个期间只能有一条计提记录。重复计提是折旧最经典的事故
-- （月结跑两遍 → 费用翻倍），在数据库这一层堵死，不靠应用记得先查。
create unique index if not exists uq_fixed_asset_depreciations_asset_period
  on fixed_asset_depreciations (asset_id, period);
create index if not exists idx_fixed_asset_depreciations_company_period
  on fixed_asset_depreciations (company_id, period);

-- 租户隔离，与 039 同一套策略：company_id 必须等于会话变量 app.current_company，
-- 无上下文时 fails-closed。
do $$
declare
  t text;
  asset_tables text[] := array['fixed_assets', 'fixed_asset_depreciations'];
begin
  foreach t in array asset_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I for all using (company_id = current_setting(''app.current_company'', true)) with check (company_id = current_setting(''app.current_company'', true))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;
