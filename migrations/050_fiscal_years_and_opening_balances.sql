-- V12-B4 + B5：期初建账的载体标记，以及会计年度 + 年末结转。
--
-- ## B4 期初建账（蓝图 E5）
--
-- `grep '期初|opening_balance|openingBalance'` 在 apps/api/src/modules 下零命中。
-- 一家运营三年的公司迁进 FT，账只能从上线那天从零开始记 —— 银行存款 0、
-- 应收账款 0、实收资本 0。这不是「少个功能」：产品只能服务从零建账的新设公司，
-- 存量企业一家都接不了。
--
-- ### 载体选型：分录上打标记，不建独立的期初余额表
--
-- 两种参考做法：ERPNext 在 GL Entry 上打 `is_opening` 标志；另一种是建一张独立的
-- 期初余额表。本迁移选前者 —— 具体做法是**期初余额就是一张真实的期初凭证**，
-- 其总账分录以 `ledger_entries.source = 'opening_balance'` 标记。理由四条：
--
-- 1. **独立表会制造第二个余额事实来源**。总账、明细账、科目余额表、资产负债表、
--    试算平衡、现金流量表……每一个读路径都得记得「再加上期初表」。漏一个就是
--    静默错账，而且是「银行存款少了 80 万」这种量级的错。这正是 V12-A3 刚收敛
--    掉的失败模式：约束/数据散在两处，没人知道到底有几处。分录同表则全部读路径
--    自动正确，零改动。
-- 2. **期初余额与业务分录同质**。它就是余额，只是发生日在建账日。放进 ledger_entries
--    之后，`entry_date <= asOfDate` 这个所有余额查询共用的谓词天然把它算进来。
-- 3. **免费获得全套闸门**：借贷平衡（checkPostable）、期间锁、科目校验
--    （account-guard 的存在/叶子/启用三查）、凭证字号（A6）、审计哈希链。
--    独立表要么重新实现一遍，要么就没有。
-- 4. **审计要看到凭证**。期初建账在国内实务里是一张正式的记账凭证，附件是上一套
--    账的科目余额表。没有凭证的期初余额在审计和税务稽查面前是不存在的。
--
-- 代价是「期初」这个语义只能靠 source 列表达 —— 所以下面加了唯一索引，让
-- 「一家公司只有一张期初凭证」成为数据库约束而不是应用层约定。
--
-- ## B5 会计年度 + 年末结转（蓝图 E6）
--
-- `grep '3141'` 只有两处 —— 科目定义，和现金流量表把它列为筹资活动对手科目。
-- **没有任何代码把 3131 本年利润结转到 3141 利润分配**。
--
-- `generateClosingEntries` 每次月结都往 3131 记贷方且从不清零。6xxx 因为结转分录
-- 会自我冲平所以自洽，3131 不会。系统跑满一个自然年就会出错：资产负债表的
-- 「本年利润」行会显示历年累计数。影响在 2027 年 1 月显现。

-- ── B5：会计年度 ────────────────────────────────────────────────────
--
-- 中国财年恒等于自然年（1.1–12.31），由 CHECK 钉死。**不做** ERPNext 的
-- `is_short_year`（首末年份可短）与多公司财年子表：前者服务的是英美 4 月制财年
-- 与开业当年的短会计年度，后者服务的是集团内不同主体用不同财年 —— 两个场景在
-- 中国境内主体上都不存在，建出来只会让每个取数路径都要处理不会发生的形状。
create table if not exists fiscal_years (
  id                 text primary key,
  company_id         text not null references companies(id) on delete cascade,
  year               int  not null,
  start_date         date not null,
  end_date           date not null,
  -- open：可继续记账与月结；closed：已生成年结凭证，3131 已转平到 3141。
  status             text not null default 'open' check (status in ('open', 'closed')),
  -- 年结凭证。净利润恰为 0 的年度不产生凭证（借贷两方都是 0，写进去也没有意义），
  -- 故允许为空 —— 这是 status='closed' 且 closing_voucher_id is null 的唯一合法情形。
  closing_voucher_id text references vouchers(id),
  -- 本年度净利润（结转进 3141 的金额）。结账时必填，用于审计追溯与「上年结转数」核对。
  net_profit         numeric(18, 2),
  closed_at          timestamptz,
  closed_by          text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, year),
  constraint fiscal_years_natural_year_check
    check (start_date = make_date(year, 1, 1) and end_date = make_date(year, 12, 31)),
  constraint fiscal_years_year_range_check
    check (year between 1980 and 2200),
  -- 结账必须留下净利润数字。允许 closing_voucher_id 为空（零利润年度），
  -- 但不允许「已结账却不知道结转了多少」。
  constraint fiscal_years_closed_has_profit_check
    check (status = 'open' or (net_profit is not null and closed_at is not null))
);

create index if not exists idx_fiscal_years_company on fiscal_years (company_id, year desc);
create index if not exists idx_fiscal_years_open on fiscal_years (company_id) where status = 'open';

comment on table fiscal_years is
  '会计年度。中国财年恒等于自然年，start_date/end_date 由 CHECK 钉死为 1.1–12.31。'
  'status=closed 表示已把 3131 本年利润结转到 3141 利润分配。';
comment on column fiscal_years.net_profit is
  '本年度净利润（正数为盈利）。年结时写入，等于结转进 3141 的金额。';

-- ── 凭证唯一性：期初凭证与年结凭证 ──────────────────────────────────
--
-- 两条都是部分唯一索引，口径与 048 的凭证号索引一致：让「只能有一张」成为数据库
-- 约束，而不是靠应用层「先查再插」—— 那中间的窗口在并发下必然被撞穿（A8 修的
-- 红冲重复正是同一类问题）。

-- 一家公司只有一张期初凭证。期初建账是上线时的一次性动作；后续年度的「期初」
-- 由年结滚动生成，不再重录。
create unique index if not exists uq_vouchers_opening_balance
  on vouchers (company_id)
  where source = 'opening_balance';

-- 一个年度只有一张年结凭证。period 取 YYYY-12（年结分录记在 12 月）。
create unique index if not exists uq_vouchers_annual_closing
  on vouchers (company_id, period)
  where source = 'annual_closing';

-- ── 存量公司的财年补齐 ──────────────────────────────────────────────
--
-- 建公司触发器（049 给科目用的那套）在这里不适用：财年是无界的时间序列，
-- 建公司时不知道要铺到哪一年。改为按「已有账务活动的年份 + 当前年份」补齐，
-- 之后由应用层的 ensureFiscalYear 按需补建。
--
-- 存量年份一律建成 open：它们确实没做过年结，硬标成 closed 会让「上年未结账」
-- 这个真实状态被抹掉 —— 而 B5 要求 4 的资产负债表自检正是要把它暴露出来。
insert into fiscal_years (id, company_id, year, start_date, end_date)
select
  c.id || ':fy' || y.year,
  c.id,
  y.year,
  make_date(y.year, 1, 1),
  make_date(y.year, 12, 31)
from companies c
cross join lateral (
  select distinct extract(year from le.entry_date)::int as year
  from ledger_entries le
  where le.company_id = c.id
  union
  select extract(year from current_date)::int
) y
where y.year between 1980 and 2200
on conflict (company_id, year) do nothing;
