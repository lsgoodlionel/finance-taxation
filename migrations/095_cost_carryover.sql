-- V14-C：生产成本归集与完工结转（约当产量法）。
--
-- ## V13 为什么不做，现在为什么能做
--
-- V13 把成本结转列入「明确不做」，理由是「需要产量与在产品数据，FT 没有」。
-- 数据来源解决了（V14 用公开的制造业成本结构造模拟数据），所以能做了。
--
-- ## 会计上的链路
--
-- ```
-- 料工费归集 → 4001 生产成本
--   ↓ 期末按约当产量分配
-- 完工产品 → 1403 库存商品      （结转）
-- 在产品   → 留在 4001 生产成本  （余额）
--   ↓ 销售时
-- 1403 库存商品 → 6401 主营业务成本
-- ```
--
-- 本迁移只管前两步。销售结转不在这里——它依赖销售单据，那是另一条链路。
--
-- ## 科目用的是本项目账表里真实存在的编码
--
-- 4001 生产成本、4101 制造费用、1403 库存商品。**不是 5001/1405**——
-- 那是另一版会计科目表的编码，写死了会在这套账上找不到科目。
-- 判定仍然靠 `account_type` 语义字段（`cost_production` / `asset_inventory`），
-- 编码只作为同类型里的定位。

-- ── 产品档案 ──────────────────────────────────────────────────────────

-- 极简的产品档案：成本结转需要知道「在算哪个产品」，仅此而已。
--
-- **不做 BOM、不做多级物料**：那是 MRP 的范畴，而这里的目标只是
-- 「让成本能结转」。BOM 会把这张表变成一棵树，随之而来的是版本、
-- 替代料、损耗率——那是一个独立产品。
create table if not exists products (
  id           text primary key,
  company_id   text not null references companies(id) on delete cascade,
  code         text not null,
  name         text not null,
  -- 计量单位。约当产量的运算要求数量是整数，按吨/米计量的产品
  -- 应当先换算成最小单位再录入（应用层校验）。
  unit         text not null default '台',
  note         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint uq_product_code unique (company_id, code)
);

comment on table products is
  'V14-C 产品档案。**不做 BOM 与多级物料**——那是 MRP 的范畴，'
  '而这里的目标只是「让成本能结转」。';

-- ── 生产批次（一个产品一个期间一条）────────────────────────────────

create table if not exists production_runs (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  product_id      text not null references products(id) on delete restrict,

  -- 会计期间 YYYY-MM。成本结转是期末动作，按期间归集。
  period          text not null check (period ~ '^\d{4}-\d{2}$'),

  -- 本期完工入库数量。
  finished_quantity   integer not null default 0 check (finished_quantity >= 0),
  -- 期末在产品数量。
  ending_wip_quantity integer not null default 0 check (ending_wip_quantity >= 0),

  status          text not null default 'draft'
                  check (status in ('draft', 'carried_over', 'cancelled')),

  -- 结转生成的凭证。**系统生成的凭证一律 draft**，延续 V12/V13 的做法：
  -- 折旧、红冲、定期凭证、增值税结转、期末调汇、借款付款、报销落账、
  -- 合同付款都是这样，成本结转没有理由例外。
  voucher_id      text references vouchers(id) on delete set null,
  carried_over_at timestamptz,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 一个产品一个期间只能有一条未作废的批次。两条会让同一批成本被结转两次。
  constraint uq_production_run
    exclude (company_id with =, product_id with =, period with =) where (status <> 'cancelled')
);

create index if not exists idx_production_runs_period
  on production_runs (company_id, period);

comment on constraint uq_production_run on production_runs is
  'V14-C：一个产品一个期间只能有一条未作废的批次。两条会让同一批成本'
  '被结转两次，而重复结转在账上表现为库存商品凭空多出一批。';

-- ── 成本项（料工费三项，各自的完工程度不同）────────────────────────

create table if not exists production_run_costs (
  id             text primary key,
  run_id         text not null references production_runs(id) on delete cascade,

  element        text not null check (element in ('material', 'labor', 'overhead')),

  -- 期初在产品成本（分）。上期结转后留在 4001 的那部分。
  opening_wip_cents bigint not null default 0 check (opening_wip_cents >= 0),
  -- 本期归集成本（分）。
  incurred_cents    bigint not null default 0 check (incurred_cents >= 0),

  -- 期末在产品对**这一项**的完工程度，基点（1/10000）。
  --
  -- **材料通常是 10000**：开工时一次性投料，做了一半的机器里材料是齐的。
  -- 人工与制造费用按加工进度。用同一个进度分三项会算错方向——
  -- 在产品的约当量变小，完工产品反而多分到成本。
  wip_completion_bp integer not null default 10000
                    check (wip_completion_bp between 0 and 10000),

  -- 结转结果。算出来存下来，不是因为算不动，而是因为**凭证已经按它做了**——
  -- 重算一次若得到不同的数（比如有人改了产量），账与结果就对不上了。
  -- 与「不存冗余汇总」不矛盾：这不是汇总，是一次已经落账的分配结果。
  finished_cents    bigint,
  ending_wip_cents  bigint,

  created_at     timestamptz not null default now(),

  constraint uq_run_cost_element unique (run_id, element),

  -- 结转结果要么都有要么都没有。只有一半会让平衡校验拿不到完整数据，
  -- 而那种残缺状态在报表上表现为「成本凭空少了一块」。
  constraint run_cost_result_paired check (
    (finished_cents is null and ending_wip_cents is null)
    or (finished_cents is not null and ending_wip_cents is not null)
  )
);

comment on column production_run_costs.wip_completion_bp is
  'V14-C：期末在产品对这一项的完工程度。**材料通常 10000**（开工即全部投入），'
  '人工与制造费用按加工进度。用同一个进度分三项会让完工成本被高估、'
  '在产品余额被低估。';

comment on column production_run_costs.finished_cents is
  'V14-C：结转结果落库不是因为算不动，而是**凭证已经按它做了**。'
  '重算若得到不同的数（有人改了产量），账与结果就对不上。'
  '这不是冗余汇总，是一次已落账的分配结果。';
