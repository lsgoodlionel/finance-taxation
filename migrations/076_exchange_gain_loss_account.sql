-- V12-D5：汇兑损益科目。
--
-- 期末调汇的对手方。《企业会计准则第 19 号》第十一条要求汇兑差额计入当期损益，
-- 实务上归入财务费用，所以挂在 6603 财务费用下作第三个明细。
--
-- ## 为什么不单开一级科目
--
-- 国标的会计科目表里没有独立的「汇兑损益」一级科目，它就是财务费用的一个明细。
-- 单开一级会让利润表多一行准则里不存在的项目。
--
-- ## 借贷都可能
--
-- 与 660301 利息支出、660302 手续费不同，这个科目**两个方向都会走**：外币升值时
-- 资产类调汇产生收益（贷方），贬值时产生损失（借方）。`direction` 仍标 debit ——
-- 它表示的是"余额通常在哪一方"，而费用类科目按惯例标借方；贷方余额（净收益）
-- 在利润表上表现为费用的负数，与投资收益之类的处理一致。

insert into account_templates (code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
select '660303', '财务费用-汇兑损益', 'expense', 'expense_finance', 'debit', '6603', true,
       -- 紧跟 660302 之后。取当前最大 sort_order + 1 而不是写死数字：
       -- 写死会在将来有人插入科目时撞上，而 sort_order 只影响展示顺序，
       -- 撞了不会报错、只会让科目树的顺序莫名其妙。
       (select coalesce(max(sort_order), 0) + 1 from account_templates where parent_code = '6603')
where not exists (select 1 from account_templates where code = '660303');

-- 已建账的公司同步补上这个科目，否则老账套做不了调汇。
-- id / path 的构造与 049 的 seed_company_accounts 一致。
insert into accounts (
  id, company_id, code, name, category, account_type, direction,
  parent_code, path, is_leaf, sort_order, source
)
select c.id || ':660303', c.id, '660303', '财务费用-汇兑损益', 'expense', 'expense_finance',
       'debit', '6603', '6603.660303'::ltree, true,
       (select coalesce(max(a.sort_order), 0) + 1 from accounts a
         where a.company_id = c.id and a.parent_code = '6603'),
       -- source 取值受 accounts_source_check 约束限定为 system / custom。
       -- 模板科目是 system：它由迁移种下，不是用户自建的。
       'system'
from companies c
where not exists (
  select 1 from accounts a where a.company_id = c.id and a.code = '660303'
);

-- 6603 从叶子变成非叶子这件事 049 已经处理过（它本来就有 660301/660302 两个明细），
-- 这里只做一次断言：父科目必须存在且非叶子，否则新明细会挂在空气上。
do $$
begin
  if not exists (select 1 from account_templates where code = '6603' and is_leaf = false) then
    raise exception '6603 财务费用不存在或仍被标为叶子科目，660303 无处可挂。';
  end if;
end $$;
