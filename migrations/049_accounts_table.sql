-- V12-B1：会计科目表落库。
--
-- ## 问题
--
-- 科目表此前是 apps/api/src/modules/accounts/chart-of-accounts.ts 里一个 63 条的
-- TypeScript 常量数组，全租户共用。后果有三层，一层比一层严重：
--
-- 1. **用户无法自定义科目**。制造业要在 4001 生产成本下挂料/工/费明细，服务业
--    根本用不到 4001，餐饮要「主营业务成本-食材/人工」。一份写死的 63 条服务不了
--    多个客户，每个新客户都要改代码发版。
-- 2. **无法按公司隔离**：多租户系统里所有公司共用同一套科目。
-- 3. **写入路径零校验**（这条最严重）。findChartAccount() 全仓 6 处调用，5 处在
--    测试、1 处在读路径，三个写入函数一次都没调；voucher_lines.account_code 与
--    ledger_entries.account_code 是裸 text，无外键无 CHECK。任何客户端调
--    POST /api/vouchers 都能写进任意字符串并过账。
--
--    这个洞已造成两次线上错账，有迁移留档：041 修的是编码体系错配导致 788,679 元
--    收入与实收资本在报表中静默消失、资产负债表不平；042 修的是分录挂到非叶子科目
--    2211 导致前缀汇总重复计量。两次都是事后 SQL UPDATE 补救，不是从写入端拦住。
--
-- ## 本迁移的范围
--
-- 只建表 + 按公司 seed 现有 63 条。**编码保持不变**——现行编码是三套准则混搭
-- （3131/3141 出自《企业会计制度》2001，6001/6801 出自《企业会计准则》2006，
-- 4001/4101 出自《小企业会计准则》），且 6001c/6301e 是为绕开前缀冲突自造的
-- 字母编码。国标化迁移影响面太大，单独立项（蓝图 D3），不与本次混做。
--
-- ## 两个分类字段并存不是冗余
--
-- - `category`（6 值）是**报表口径**，与现有 chart-of-accounts.ts 完全一致，
--   资产负债表/利润表的归类逻辑（V12-A5 刚整理过）直接沿用，零改动。
-- - `account_type`（细分语义）驱动**业务规则**：哪些科目能核销、哪些不结转期初、
--   哪个是本年利润、哪个是所得税费用。FT 现在到处硬编码 "3131"/"1601"/"6801"
--   的根因就是没有这层语义标签。
--
-- account_type 可以推出 category，但反过来不行。保留两者是为了让 A5 的读路径不
-- 受影响，同时给 B4（期初建账）/B5（年结）/C1（固定资产）提供它们需要的语义。

create extension if not exists ltree;

create table if not exists accounts (
  id            text primary key,
  -- 科目属于公司：公司被删（测试夹具、租户注销）时科目一并清理。
  -- 不加 cascade 的话，删公司会被这个外键挡住，而一套没有主体的科目也没有意义。
  company_id    text not null references companies(id) on delete cascade,
  code          text not null,
  name          text not null,
  -- 报表口径，取值与 chart-of-accounts.ts 的 AccountCategory 一致
  category      text not null check (category in ('asset','liability','equity','cost','revenue','expense')),
  -- 业务语义，见文件头说明
  account_type  text not null,
  direction     text not null check (direction in ('debit','credit')),
  parent_code   text,
  -- 科目树路径，用编码构成（ltree 标签只允许字母数字下划线，故编码里的字母原样可用）
  path          ltree not null,
  is_leaf       boolean not null default true,
  is_active     boolean not null default true,
  -- system：由模板 seed 而来，用户可停用不可删除；custom：用户自建
  source        text not null default 'system' check (source in ('system','custom')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists idx_accounts_path on accounts using gist (path);
create index if not exists idx_accounts_company_type on accounts (company_id, account_type);
-- 支撑「以某编码为前缀」的查询，替代遍地的 like '6%'
create index if not exists idx_accounts_company_code_prefix
  on accounts (company_id, code text_pattern_ops);

-- ── 科目模板 ────────────────────────────────────────────────────────
--
-- 模板与公司科目分开存：建公司时从模板实例化一份，之后公司可以自行增删改而
-- 不影响模板。将来支持多套准则（小企业会计准则 / 企业会计准则）时，这里加一个
-- template_key 即可，不必改 accounts 表。
create table if not exists account_templates (
  template_key  text not null default 'default',
  code          text not null,
  name          text not null,
  category      text not null,
  account_type  text not null,
  direction     text not null,
  parent_code   text,
  is_leaf       boolean not null default true,
  sort_order    int not null default 0,
  primary key (template_key, code)
);

-- ── 按公司 seed ─────────────────────────────────────────────────────
--
-- account_type 的映射依据是科目的会计性质，不是编码段位。几个关键的：
--   3131 本年利润   → equity_unaffected   （年结要把它转平，且它不结转期初）
--   3141 利润分配   → equity_retained     （年结的对手方）
--   6001c 主营成本  → expense_direct_cost （营业成本，与期间费用分开）
--   6301e02 折旧    → expense_depreciation（固定资产折旧的费用归集科目）
--   6801 所得税     → expense_tax         （净利润 = 利润总额 − 它，不能混进期间费用）
--   1602/1702       → contra_asset        （备抵科目，余额在贷方但属资产类）
insert into account_templates (code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
select t.code, t.name, t.category, t.account_type, t.direction, t.parent_code, t.is_leaf, t.sort_order
from (values
  -- 资产
  ('1001','库存现金','asset','asset_cash','debit',null,true,1),
  ('1002','银行存款','asset','asset_cash','debit',null,true,2),
  ('1012','其他货币资金','asset','asset_cash','debit',null,true,3),
  ('1121','应收票据','asset','asset_receivable','debit',null,true,4),
  ('1122','应收账款','asset','asset_receivable','debit',null,true,5),
  ('1123','预付账款','asset','asset_prepayment','debit',null,true,6),
  ('1131','应收利息','asset','asset_receivable','debit',null,true,7),
  ('1221','其他应收款','asset','asset_receivable','debit',null,true,8),
  ('1401','原材料','asset','asset_inventory','debit',null,true,9),
  ('1403','库存商品','asset','asset_inventory','debit',null,true,10),
  ('1601','固定资产','asset','asset_fixed','debit',null,true,11),
  ('1602','累计折旧','asset','contra_asset','credit',null,true,12),
  ('1701','无形资产','asset','asset_intangible','debit',null,true,13),
  ('1702','累计摊销','asset','contra_asset','credit',null,true,14),
  ('1801','长期待摊费用','asset','asset_non_current','debit',null,false,15),
  ('1801001','长期待摊费用-装修','asset','asset_non_current','debit','1801',true,16),
  ('1801002','长期待摊费用-其他','asset','asset_non_current','debit','1801',true,17),
  -- 负债
  ('2001','短期借款','liability','liability_borrowing','credit',null,true,20),
  ('2201','应付票据','liability','liability_payable','credit',null,true,21),
  ('2202','应付账款','liability','liability_payable','credit',null,true,22),
  ('2203','预收账款','liability','liability_current','credit',null,true,23),
  ('2211','应付职工薪酬','liability','liability_payroll','credit',null,false,24),
  ('22110101','应付职工薪酬-工资','liability','liability_payroll','credit','2211',true,25),
  ('22110102','应付职工薪酬-社保（单位）','liability','liability_payroll','credit','2211',true,26),
  ('22110103','应付职工薪酬-公积金（单位）','liability','liability_payroll','credit','2211',true,27),
  ('2221','应交税费','liability','liability_tax','credit',null,false,28),
  ('222101','应交税费-应交增值税（销项）','liability','liability_tax','credit','2221',true,29),
  ('222102','应交税费-应交增值税（进项）','liability','liability_tax','debit','2221',true,30),
  ('222103','应交税费-应交企业所得税','liability','liability_tax','credit','2221',true,31),
  ('222104','应交税费-应交个人所得税','liability','liability_tax','credit','2221',true,32),
  ('222105','应交税费-应交印花税','liability','liability_tax','credit','2221',true,33),
  ('222106','应交税费-城建税及附加','liability','liability_tax','credit','2221',true,34),
  ('2231','应付利息','liability','liability_current','credit',null,true,35),
  ('2241','其他应付款','liability','liability_current','credit',null,true,36),
  ('2401','长期借款','liability','liability_non_current','credit',null,true,37),
  -- 权益
  ('3001','实收资本','equity','equity','credit',null,true,40),
  ('3002','资本公积','equity','equity','credit',null,true,41),
  ('3101','盈余公积','equity','equity','credit',null,true,42),
  ('3131','本年利润','equity','equity_unaffected','credit',null,true,43),
  ('3141','利润分配','equity','equity_retained','credit',null,true,44),
  -- 成本
  ('4001','生产成本','cost','cost_production','debit',null,true,50),
  ('4101','制造费用','cost','cost_production','debit',null,true,51),
  -- 收入
  ('6001','主营业务收入','revenue','income','credit',null,true,60),
  ('6051','其他业务收入','revenue','income','credit',null,true,61),
  ('6111','投资收益','revenue','income_other','credit',null,true,62),
  ('6301','营业外收入','revenue','income_other','credit',null,true,63),
  -- 费用
  ('6001c','主营业务成本','expense','expense_direct_cost','debit',null,true,70),
  ('6101','税金及附加','expense','expense_tax_surcharge','debit',null,true,71),
  ('6201','销售费用','expense','expense','debit',null,true,72),
  ('6301e','管理费用','expense','expense','debit',null,false,73),
  ('6301e01','管理费用-办公费','expense','expense','debit','6301e',true,74),
  ('6301e02','管理费用-折旧','expense','expense_depreciation','debit','6301e',true,75),
  ('6301e03','管理费用-差旅费','expense','expense','debit','6301e',true,76),
  ('6301e04','管理费用-业务招待费','expense','expense','debit','6301e',true,77),
  ('6301e05','管理费用-租金','expense','expense','debit','6301e',true,78),
  ('6301e06','管理费用-研发费用','expense','expense','debit','6301e',true,79),
  ('6301e07','管理费用-其他','expense','expense','debit','6301e',true,80),
  ('6401','财务费用','expense','expense_finance','debit',null,false,81),
  ('6401001','财务费用-利息支出','expense','expense_finance','debit','6401',true,82),
  ('6401002','财务费用-手续费','expense','expense_finance','debit','6401',true,83),
  ('6601','职工薪酬（成本）','expense','expense','debit',null,true,84),
  ('6711','营业外支出','expense','expense_other','debit',null,true,85),
  ('6801','所得税费用','expense','expense_tax','debit',null,true,86)
) as t(code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
on conflict (template_key, code) do nothing;

-- ── 实例化：函数 + 触发器 ───────────────────────────────────────────
--
-- 建公司时自动铺一套科目。**用触发器而不是在建公司的代码路径里 seed**：
-- 建公司有多条路径（注册、种子迁移、测试夹具、将来的批量导入），逐条记得调用
-- 必然遗漏——而一个没有科目的公司连第一张凭证都记不了。与 voucher_lines 的
-- company_id 同一个判断：属于「不该由调用方负责」的初始化，交给数据库。
create or replace function seed_company_accounts(target_company_id text, template text default 'default')
returns void as $$
begin
  insert into accounts (
    id, company_id, code, name, category, account_type, direction, parent_code, path, is_leaf, sort_order
  )
  select
    target_company_id || ':' || t.code,
    target_company_id,
    t.code, t.name, t.category, t.account_type, t.direction, t.parent_code,
    (coalesce(t.parent_code || '.', '') || t.code)::ltree,
    t.is_leaf, t.sort_order
  from account_templates t
  where t.template_key = template
  on conflict (company_id, code) do nothing;
end;
$$ language plpgsql;

create or replace function companies_seed_accounts() returns trigger as $$
begin
  perform seed_company_accounts(new.id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_companies_seed_accounts on companies;
create trigger trg_companies_seed_accounts
  after insert on companies
  for each row execute function companies_seed_accounts();

-- 已存在的公司补齐
do $$
declare c record;
begin
  for c in select id from companies loop
    perform seed_company_accounts(c.id);
  end loop;
end $$;

comment on table accounts is
  '会计科目主数据，按公司隔离。source=system 的行由模板 seed，用户可停用不可删除。';
comment on column accounts.account_type is
  '业务语义标签，驱动「能否核销/是否结转期初/是不是本年利润」等规则。'
  '与 category（报表口径）并存：account_type 可推出 category，反之不行。';
comment on column accounts.path is
  '科目树路径（ltree）。用它做「含下级」查询，替代遍地的 like ''6%'' 前缀判定 —— '
  '后者在 6001c/6301e 这类自造编码上会误伤（6001c 会被 6001 的前缀命中）。';
