-- 研发支出科目：把库对齐到 `chart-of-accounts.ts` 与业务代码已经在用的那一套。
--
-- ## 差异是什么
--
--   编码      库（049 落库）           TS 常量 + 全部业务代码
--   1801      长期待摊费用（非叶子）     长期待摊费用（**叶子**）
--   1801001   长期待摊费用-装修         **研发支出-费用化支出**（独立一级）
--   1801002   长期待摊费用-其他         **研发支出-资本化支出**（独立一级）
--
-- 不只是名称：常量把这两个从 1801 的子科目改成了**独立一级科目**
--（`parentCode: null`），1801 本身也随之回到叶子。
--
-- ## 为什么以常量为准（与迁移 077 相反）
--
-- 077 修管理费用错位时以库为准，因为那处只有 TS 常量一家错位、业务代码本身没有
-- 一致的意图。这一处正相反：
--
-- 1. **全部业务代码都按「研发支出」在用**——`events/routes.ts` 生成研发费用归集
--    凭证挂 1801001、`risk/engine.ts` 靠 1801001/1801002 检测研发支出、
--    `reports/summary.ts` 把它们归进现金流的投资活动。四处一致。
-- 2. `chart-of-accounts.ts` 的注释写明了这是**有意的设计变更**：「它们并不是长期
--    待摊费用的明细（名称、用途都不同），而 1801 自身又标着 isLeaf: true——一个
--    叶子科目带着子科目，树形展示与『叶子才可记账』的规则同时被破坏」。
--    改常量的人做了判断，只是**没有配套迁移**。
-- 3. 会计上研发支出确实是独立科目（应用指南 5301 研发支出），不是长期待摊费用的
--    明细——长期待摊费用是装修、租入固定资产改良这类，与研发无关。
--
-- ## 数据风险为零
--
-- 实测：`ledger_entries` / `voucher_lines` / `voucher_draft_lines` 里这两个编码
-- **一条分录都没有**。改名与改父级不影响任何已入账数据。
--
-- 这处错位是 chart-parity 护栏在迁移 077 收窄名称豁免之后立刻抓出来的——
-- 此前那条护栏对名称一个字都不看，两侧说的是完全不同的科目也不会报。

do $$
declare
  stray bigint;
begin
  -- 改之前确认一次：有分录就说明有人真的往「长期待摊费用-装修」上记过账，
  -- 那样改名会让那笔账的科目名突然变成研发支出。宁可迁移失败也不静默改写。
  select count(*) into stray
    from (
      select account_code from ledger_entries
      union all select account_code from voucher_lines
      union all select account_code from voucher_draft_lines
    ) all_codes
   where account_code in ('1801001', '1801002');

  if stray > 0 then
    raise exception
      '1801001 / 1801002 上有 % 条分录。改名前请先确认这些账记的到底是长期待摊费用'
      '还是研发支出——两者的税务处理完全不同（研发支出可加计扣除）。', stray;
  end if;
end $$;

update account_templates
   set name = '研发支出-费用化支出', parent_code = null
 where code = '1801001';

update account_templates
   set name = '研发支出-资本化支出', parent_code = null
 where code = '1801002';

-- 1801 失去全部子科目后回到叶子：常量表里它就是 `isLeaf: true`，
-- 而非叶子科目在科目选择器里选不到、也不允许记账。
update account_templates set is_leaf = true where code = '1801';

update accounts
   set name = '研发支出-费用化支出', parent_code = null,
       path = '1801001'::ltree, updated_at = now()
 where code = '1801001';

update accounts
   set name = '研发支出-资本化支出', parent_code = null,
       path = '1801002'::ltree, updated_at = now()
 where code = '1801002';

update accounts set is_leaf = true, updated_at = now() where code = '1801';

-- 自检：改完之后两侧必须一致，否则 chart-parity 会在下一次跑测试时红，
-- 而那时已经离开这个迁移的上下文、要重新查一遍才知道发生了什么。
do $$
declare
  bad record;
begin
  for bad in
    select code, name, parent_code from account_templates
     where code in ('1801001', '1801002')
       and (name not like '研发支出-%' or parent_code is not null)
  loop
    raise exception '% 改写后仍是「%」parent=%，与 chart-of-accounts.ts 对不上。',
      bad.code, bad.name, coalesce(bad.parent_code, 'null');
  end loop;
end $$;
