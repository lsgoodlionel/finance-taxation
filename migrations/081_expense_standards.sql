-- V13-A1：费用标准库。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段零」。
--
-- ## 这是整条费控链的地基
--
-- 阶段三的「智能审核」要判超标，判据就来自这张表。没有它，超标只能靠审批人
-- 凭记忆——而「M2 去上海住宿多少封顶」这种事没人记得住，结果是审批沦为盖章。
--
-- ## 维度：费用类型 × 职级 × 城市等级
--
-- 后两个维度允许为 null 表示通配，于是同一笔支出常常命中多条标准。挑哪一条由
-- `expense-standards/match.ts` 的「最具体优先」规则决定，**不在 SQL 里排序**——
-- 那个规则有三级 tiebreak，写进 SQL 会散落在每个查询里各写一遍。
--
-- ## 不建费用类型主表
--
-- 与 075 不建币种主表同理：费用类型是业务约定而非系统定义的实体，单开一张表
-- 只会多一层要同步的间接。取值约束靠 CHECK，改起来是一次迁移的事。

create table if not exists expense_standards (
  id             text primary key,
  company_id     text not null references companies(id) on delete cascade,

  -- 费用类型。取值收在 CHECK 里而不是外键表，理由见文件头。
  expense_type   text not null check (expense_type in (
    'travel_hotel',      -- 差旅-住宿
    'travel_meal',       -- 差旅-餐补
    'travel_transport',  -- 差旅-交通
    'entertainment',     -- 业务招待
    'office',            -- 办公用品
    'communication',     -- 通讯
    'training',          -- 培训
    'other'
  )),

  -- 职级；null = 不限职级。不引用用户表：职级体系是 HR 的概念，FT 只借用它
  -- 的编码做匹配，绑外键会把费控的可用性押在 HR 档案的完整度上。
  grade_code     text,

  -- 城市等级；null = 不限城市。同样只存编码。
  city_tier      text check (city_tier is null or city_tier in ('tier1', 'tier2', 'tier3')),

  -- 限额（分）。整数分，与折旧、外币分摊同一口径。
  limit_cents    bigint not null check (limit_cents >= 0),

  -- 限额的计量基准。per_day 要乘天数，另两种不乘——把 per_time 乘以次数
  -- 等于「可以多报几次」，是对限额的曲解（check.ts 有对应用例）。
  limit_basis    text not null check (limit_basis in ('per_day', 'per_time', 'per_month')),

  -- 超标之后怎么办。**默认 warn 而不是 block**：一上来就拦会让刚配好标准的
  -- 公司大面积提不了单，而配标准时很难一次配准。宽进严出，让数据先跑起来。
  over_policy    text not null default 'warn' check (over_policy in ('block', 'warn', 'escalate')),

  -- 生效区间，两端都是**闭区间**。「有效期至 3 月 31 日」在会计语境里意味着
  -- 31 日当天可用；写成半开区间会让最后一天的单据用错标准（match.ts 有用例）。
  effective_from date not null,
  effective_to   date,

  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint expense_standards_effective_range check (
    effective_to is null or effective_to >= effective_from
  )
);

-- 同一维度组合在同一时点只应有一条标准。**不做成唯一约束**：生效区间重叠的
-- 判定需要区间运算，普通唯一索引表达不了，而 btree_gist + 排他约束要额外扩展。
-- 配重了会被 match.ts 的 id 决胜规则消化掉（结果确定但可能不是想要的那条），
-- 由 A1 的配置界面在写入前查重来防。这里只加查询索引。
create index if not exists idx_expense_standards_lookup
  on expense_standards (company_id, expense_type, effective_from);

comment on table expense_standards is
  'V13-A1 费用标准库。按「费用类型 × 职级 × 城市等级」定义限额，后两个维度可为 null 表示通配。'
  '匹配规则（最具体优先、职级压过城市、id 决胜）实现在 expense-standards/match.ts，不在 SQL 里。';

comment on column expense_standards.over_policy is
  '超标处理：block 拦截提交 / warn 提示放行 / escalate 放行但多加一级审批。'
  'escalate 由审批流引擎（V13-A5）接手，不在本表生效。';
