-- 管理费用明细的名称错位收口：新增 660208「管理费用-工资」、改正演示种子的错挂，
-- 并留下一张只读核对视图供人工判断真实账套里的历史分录。
--
-- ## 错位是什么
--
-- `account_templates`（本文件所在的库侧，UI 科目选择器与报表分类的事实来源）与
-- `apps/api/src/modules/accounts/chart-of-accounts.ts`（业务代码依据的 TS 常量）
-- 在管理费用明细上整体错开一位：
--
--   编码      库（049 落库、070 改码）    TS 常量（本次改为与库一致）
--   660201    管理费用-办公费             管理费用-工资       ← 错
--   660202    管理费用-折旧               管理费用-折旧        ✓
--   660203    管理费用-差旅费             管理费用-办公费      ← 错
--   660204    管理费用-业务招待费          管理费用-差旅费      ← 错
--   660205    管理费用-租金               管理费用-业务招待费   ← 错
--   660206    管理费用-研发费用            管理费用-研发费用     ✓
--   660207    管理费用-其他               管理费用-其他        ✓
--
-- 错位的税务后果是实的：`events/travel-expense-rules.ts` 按常量把差旅费挂 660204，
-- 而库里 660204 是业务招待费——业务招待费只能按 60% 扣除且不超营业收入 5‰，
-- 差旅费可全额扣除，记错这一笔企业要多缴税。
--
-- ## 为什么以库为准
--
-- V12 残留 7 已经确立 `accounts` 是报表分类的事实来源；D3 编码映射表
-- `accounts/code-standardization.ts` 写的也是库这一套名称（660203 差旅费、
-- 660204 业务招待费、660205 租金）。只有 `chart-of-accounts.ts` 一家错位，
-- 改它的成本最小、且不动任何已入账数据的科目归属。
--
-- ## 错位的来龙去脉
--
-- 041 的映射注释断言「6301e01=工资、6301e03=办公费」，与 TS 常量完全一致；
-- 049 落库时写的却是「6301e01=办公费、6301e03=差旅费」。两份在同一个月分头写成，
-- 谁也没对过谁。070（V12-D3）只把编码前缀从 6301e0x 换成 6602xx，名称一个没动，
-- 所以错位原样保留到现在。
--
-- `chart-parity.integration.test.ts` 本该拦住它，但那条护栏明确豁免了名称比对
-- （「迁移里的名称常带前缀限定，逐字比对只是噪音」），恰好放过这一类。
-- 本次一并把豁免收窄到「库名称是常量名称的前缀限定」。

-- ── 一、新增 660208 管理费用-工资 ────────────────────────────────────
--
-- 库里原本没有这个明细，而 `payroll/social-security-vouchers.ts` 把单位承担的
-- 社保与公积金挂在 660201 上并写名称「管理费用-工资」——挂错了科目（660201 是
-- 办公费），且挂的那个名称在库里根本不存在。
--
-- 不并入 660207「管理费用-其他」：研发费用加计扣除要按人工费用归集，混进杂项
-- 明细后只能靠摘要文本去拆。也不挂 6601「职工薪酬（成本）」：那是成本性质的
-- 科目（生产人员薪酬），管理人员社保挂上去会污染营业成本口径，何况 070 的注释
-- 已记录 6601 的科目设置本身存疑。管理人员薪酬在会计上确应进管理费用。

insert into account_templates (code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
select '660208', '管理费用-工资', 'expense', 'expense', 'debit', '6602', true,
       -- 与 076 同样取当前最大 sort_order + 1，不写死数字：sort_order 只影响展示
       -- 顺序，写死后被别人插队撞上不会报错，只会让科目树的顺序莫名其妙。
       (select coalesce(max(sort_order), 0) + 1 from account_templates where parent_code = '6602')
where not exists (select 1 from account_templates where code = '660208');

-- 已建账的公司同步补上，否则老账套生成三险一金凭证时挂不到科目。
-- id / path 的构造与 049 的 seed_company_accounts 一致。
insert into accounts (
  id, company_id, code, name, category, account_type, direction,
  parent_code, path, is_leaf, sort_order, source
)
select c.id || ':660208', c.id, '660208', '管理费用-工资', 'expense', 'expense',
       'debit', '6602', '6602.660208'::ltree, true,
       (select coalesce(max(a.sort_order), 0) + 1 from accounts a
         where a.company_id = c.id and a.parent_code = '6602'),
       -- source 受 accounts_source_check 约束限定为 system / custom。
       -- 模板科目是 system：由迁移种下，不是用户自建的。
       'system'
from companies c
where not exists (
  select 1 from accounts a where a.company_id = c.id and a.code = '660208'
);

do $$
begin
  if not exists (select 1 from account_templates where code = '6602' and is_leaf = false) then
    raise exception '6602 管理费用不存在或仍被标为叶子科目，660208 无处可挂。';
  end if;
end $$;

-- ── 二、改正演示种子分录的错挂 ──────────────────────────────────────
--
-- 015 的演示账套里有两笔分录，自带的 account_name 与所挂科目对不上：
--
--   le-003-2 / vl-003-2  「管理费用-租金」  挂在 660203（库=差旅费）→ 应挂 660205
--   le-007-3 / vl-007-3  「管理费用-工资」  挂在 660201（库=办公费）→ 应挂 660208
--
-- 这是 041 留下的：015 按国标 2006 编号把两笔都写在 `6602` 上，041 把它们分别
-- 映射到 6301e03 / 6301e01，依据的是 041 自己那套（错的）名称认知。070 又把编码
-- 换成 660203 / 660201，错挂原样跟了过来。
--
-- **只改演示种子，不动真实账套。** 判据是主键精确等值——这两个 id 是 015 写死的
-- 种子行，真实公司的分录 id 不可能与之相同。真实账套里同类的历史分录按差额不
-- 凑平原则照实保留，由第三节的核对视图列出来供人工判断。
--
-- 幂等：改完之后 account_code 不再等于旧值，重复执行影响 0 行。

do $$
declare
  affected integer;
  total    integer := 0;
begin
  update ledger_entries set account_code = '660205'
   where id = 'le-003-2' and account_code = '660203' and account_name = '管理费用-租金';
  get diagnostics affected = row_count; total := total + affected;

  update ledger_entries set account_code = '660208'
   where id = 'le-007-3' and account_code = '660201' and account_name = '管理费用-工资';
  get diagnostics affected = row_count; total := total + affected;

  update voucher_lines set account_code = '660205'
   where id = 'vl-003-2' and account_code = '660203' and account_name = '管理费用-租金';
  get diagnostics affected = row_count; total := total + affected;

  update voucher_lines set account_code = '660208'
   where id = 'vl-007-3' and account_code = '660201' and account_name = '管理费用-工资';
  get diagnostics affected = row_count; total := total + affected;

  raise notice '077: 演示种子分录改挂 % 行（首次执行应为 4 行，重复执行为 0）', total;
end $$;

-- ── 三、历史分录核对视图（只读，不改写任何数据）──────────────────────
--
-- 真实账套里可能还有同类错挂。它们已经入账、可能已经关账并出过报表，追溯改写会
-- 改变已出具报表的数字，所以按差额不凑平原则照实保留，只把可疑的挑出来给人看。
--
-- 判据故意收得很紧：**分录自带的 account_name 字面等于另一个真实科目的标准名**。
--
-- 041 说过 account_name 是描述性冗余字段，「销售费用-工资」这种对 6201 销售费用的
-- 细化是合理的、比科目标准名更有信息量，不该报。而它不等于任何科目的标准名，
-- 所以不会命中。会命中的是「分录说自己是管理费用-租金，却挂在管理费用-差旅费上」
-- 这一类——名称明确指向另一个存在的科目，二者只能有一个是对的。

create or replace view ledger_entry_account_name_conflicts as
select
  le.id                as ledger_entry_id,
  le.company_id,
  le.entry_date,
  le.summary,
  le.account_code      as posted_code,
  posted.name          as posted_code_name,
  le.account_name      as entry_account_name,
  named.code           as name_matches_code,
  le.debit,
  le.credit
from ledger_entries le
join accounts named
  on named.company_id = le.company_id
 and named.name       = le.account_name
 and named.code      <> le.account_code
left join accounts posted
  on posted.company_id = le.company_id
 and posted.code       = le.account_code;

comment on view ledger_entry_account_name_conflicts is
  '分录自带的 account_name 字面命中了另一个真实科目的标准名——名称与所挂科目二者'
  '只能有一个是对的，需人工判断。刻意不做自动改写：这些分录可能已关账并出过报表，'
  '追溯改写会改变已出具报表的数字（差额不凑平原则）。'
  '判据只认「等于另一个科目的标准名」，「销售费用-工资」这类描述性细化不会被误报。';

comment on column accounts.name is
  '科目名称。本表（连同 account_templates）是科目名称的事实来源；'
  'apps/api/src/modules/accounts/chart-of-accounts.ts 那份 TS 常量必须跟随它，'
  '由 chart-parity.integration.test.ts 守住——该护栏只容许「库名称是常量名称的'
  '前缀限定」这一类差异，语义不同的名称一律判失败（迁移 077）。';
