-- V13-A2：预算表与占用台账。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段零」。
--
-- ## 为什么必须有「占用」这张台账
--
-- 只记实际发生数是最常见的错法：三个人各自申请 8 万、预算 10 万，逐张单子看
-- 都没超（钱还没花出去，账上实际发生额是 0），全部批准后实际超支 14 万。
--
-- 占用（encumbrance）堵的正是这个洞——申请通过时钱还没花，但**已经不能给
-- 别人用了**。这是会计上 encumbrance accounting 的标准做法。
--
-- ## 已有的 budget-variance 接口不作废
--
-- `analytics/routes.ts` 的预算差异接口早就在，但预算金额靠 URL 传参——
-- 接口是对的，缺的是数据源。本迁移落地后把它接上即可（V13-D7），不重写。

create table if not exists budgets (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,

  -- 期间类型与期间键。键的格式随类型变，用 CHECK 卡死配对关系——
  -- 「period_type = month 但 period_key = '2026'」这种数据一旦进来，
  -- 所有按期间聚合的地方都要额外防一手。
  period_type     text not null check (period_type in ('month', 'quarter', 'year')),
  period_key      text not null,

  -- 部门；null = 全公司预算。引用成本中心（V12-D1 已建）而不是另造部门表。
  cost_center_id  text references cost_centers(id) on delete restrict,

  -- 科目；null = 不限科目的总额预算。**不加外键**：预算常常按科目**前缀**
  -- 立（「6602 管理费用」下的所有明细共用一个预算），而前缀不是 accounts 表
  -- 里的一行。取数时用 like 匹配，与 analytics 的口径一致。
  account_code    text,

  amount_cents    bigint not null check (amount_cents >= 0),

  -- 超支拦还是提示。**默认 warn**：与费用标准同理，一上来就拦会让预算配得
  -- 不准的公司提不了单。
  control_policy  text not null default 'warn' check (control_policy in ('block', 'warn')),

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 同一维度组合只能有一条预算。维度含 null（全公司 / 不限科目），而 Postgres
  -- 的普通唯一约束里 null 互不相等——两条「全公司不限科目」的预算能同时存在。
  -- 所以用 coalesce 到哨兵值的表达式唯一索引（见下方 create unique index）。
  constraint budgets_period_key_matches_type check (
    case period_type
      when 'month'   then period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'
      when 'quarter' then period_key ~ '^\d{4}-Q[1-4]$'
      when 'year'    then period_key ~ '^\d{4}$'
    end
  )
);

-- 维度唯一：null 用哨兵值补齐，否则「全公司 / 不限科目」的预算可以重复建，
-- 而重复建的两条预算会让可用额度凭空翻倍。
create unique index if not exists uq_budgets_dimension
  on budgets (
    company_id,
    period_type,
    period_key,
    coalesce(cost_center_id, '*'),
    coalesce(account_code, '*')
  );

create table if not exists budget_encumbrances (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  budget_id     text not null references budgets(id) on delete cascade,

  -- 占用来源。单据表要等批次 B 才建，所以这里**不加外键**——加了会让本迁移
  -- 依赖尚不存在的表，把批次 A 的独立交付性搭进去。source_id 的有效性由
  -- 应用层保证，孤儿记录由 B 批次的护栏扫。
  source_type   text not null check (source_type in ('request', 'advance', 'reimbursement', 'payment')),
  source_id     text not null,

  amount_cents  bigint not null check (amount_cents >= 0),

  -- 占用的生命周期：
  --   reserved  已占用，计入「已占用」——钱没花但不能给别人用
  --   realized  已转实际，**不再计入已占用**，因为账上已经有实际发生额了
  --   released  已释放（单据作废/驳回），不计入任何口径
  --
  -- realized 与实际发生额的互斥是整个口径的关键：算重了会让预算凭空少一半。
  -- budget/check.ts 的「占用与实际发生不重复计」用例锁的就是这条。
  status        text not null default 'reserved'
                check (status in ('reserved', 'realized', 'released')),

  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- **幂等的关键**：一张单据对一个预算只有一条占用记录，状态在这一行上流转，
  -- 不插新行。审批接口被重复调用（网络重试、用户连点）时，插入会撞唯一约束
  -- 而不是把预算占用两遍。
  constraint uq_budget_encumbrance_source unique (budget_id, source_type, source_id)
);

create index if not exists idx_budget_encumbrances_budget_status
  on budget_encumbrances (budget_id, status);

comment on table budgets is
  'V13-A2 预算表。维度是「期间 × 部门 × 科目」，后两者可为 null 表示不限。'
  'account_code 不加外键：预算常按科目前缀立，前缀不是 accounts 表里的一行。';

comment on table budget_encumbrances is
  'V13-A2 预算占用台账。申请审批通过时占用（reserved），落账时转实际（realized），'
  '单据作废时释放（released）。realized 不再计入已占用——账上已有实际发生额，算两遍会让预算凭空少一半。';

comment on column budget_encumbrances.source_id is
  '来源单据 ID。**故意不加外键**：单据表在批次 B 才建，加外键会让本迁移依赖'
  '尚不存在的表。有效性由应用层保证。';
