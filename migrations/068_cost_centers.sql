-- V12-D1：成本中心（部门费用核算维度）。
--
-- ## 现在回答不了「销售部这个月花了多少」
--
-- 费用科目在账上只有一个合计：管理费用-差旅 8 万。是销售部跑客户花的，还是
-- 研发部出差调研花的，账上看不出来。部门负责人拿不到自己的费用明细，
-- 预算控制无从谈起，年底分摊也只能靠翻凭证摘要猜。
--
-- `business_events.department` 是一个**自由文本**字段（001 建表时就是），
-- 既不是外键也没有约束，"销售部"和"销售中心"在里面是两个不同的部门。
-- 它做不了核算维度。
--
-- ## 与 C2 的往来维度同一套做法
--
-- 往来核算（迁移 063）给 `ledger_entries` 加了 `counterparty_id`，让账龄成为可能。
-- 成本中心是同一个模式的第二个维度：分录上带一个可空的维度 id，
-- 由科目语义决定该不该有，报表按它分组。
--
-- 沿用同样的取舍：
-- - **可空**，因为绝大多数分录（银行存款、应交税费、实收资本）不属于任何部门；
-- - **不加外键**到 `cost_centers`，避免"先记账后建档"这个常见顺序被挡住。
--
-- ## 成本中心不等于部门
--
-- 关联 `department_id` 但不复用 `departments` 表本身：成本中心常比部门更细
--（一个部门下的多条产品线）或更粗（几个部门合成一个费用归集口径），
-- 而且部门是组织架构、会随人事调整变动，成本中心是核算口径、要在历史上保持稳定。
-- 两者绑死会让一次部门合并把历年的费用归集全部改写。

create table if not exists cost_centers (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  /** 可选关联到组织架构；null 表示这是一个独立的核算口径（如某产品线、某项目）。 */
  department_id text references departments(id) on delete set null,
  notes text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 编码在公司内唯一。停用的成本中心也占用编码——历史分录还指着它，
-- 编码被别人复用会让旧报表串户。
create unique index if not exists uq_cost_centers_code on cost_centers (company_id, code);
create index if not exists idx_cost_centers_company on cost_centers (company_id, is_active);

alter table ledger_entries add column if not exists cost_center_id text;
alter table voucher_lines add column if not exists cost_center_id text;

create index if not exists idx_ledger_entries_cost_center
  on ledger_entries (company_id, cost_center_id, account_code)
  where cost_center_id is not null;

alter table cost_centers enable row level security;
drop policy if exists cost_centers_tenant_isolation on cost_centers;
create policy cost_centers_tenant_isolation on cost_centers
  for all
  using (company_id = current_setting('app.current_company', true))
  with check (company_id = current_setting('app.current_company', true));

comment on column ledger_entries.cost_center_id is
  '成本中心（部门费用核算维度）。费用类与成本类科目的分录应带上它，否则该笔进不了'
  '部门费用报表。非费用科目留空——银行存款不属于任何部门。';
