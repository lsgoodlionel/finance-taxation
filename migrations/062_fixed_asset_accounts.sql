-- V12-C1：固定资产处置所需的两个科目。
--
-- ## 为什么现在才需要
--
-- 049 的科目表能记录固定资产（1601）和累计折旧（1602），但资产**离开**账面时
-- 无处落脚：原值和累计折旧对冲后总有一个净值差额，它既不是收入也不是费用，
-- 是「资产处置损益」。没有这个科目，处置凭证就配不平，用户只能随手塞进
-- 营业外收支 —— 那会让利润表上的「资产处置收益」永远是 0，而营业外收支里
-- 混着一堆本该单列的处置损益。
--
--   1606 固定资产清理：资产转入清理至处置完成之间的过渡科目
--   6115 资产处置损益：处置净损益的最终落脚点
--
-- ## 6115 归 revenue 而非 expense
--
-- 《企业会计准则》利润表把「资产处置收益」列在营业利润的**加项**，与投资收益
-- 并列。损失时它是借方余额，在同一行以负数列示 —— 这和「费用」是两种不同的
-- 报表位置。归成 expense 会让一笔处置收益在利润表上变成负费用，营业利润算对了，
-- 但「资产处置收益」这一行永远为 0。
--
-- 它**不**加进 reports/profit-accounts.ts 的 REVENUE_ACCOUNT_PREFIXES ——
-- 那份前缀表是「营业收入」的口径，处置损益不属于营业收入。分类以科目主数据的
-- category 为准，前缀表只是兜底。
--
-- ## 同步改了硬编码表
--
-- apps/api/src/modules/accounts/chart-of-accounts.ts 是报表侧
-- （profit-accounts.ts 的 findChartAccount）实际读的表，049 落库后它仍在服役。
-- 只加数据库不加那张表，6115 会走「6 开头且不是收入 → 一律计费用」的兜底，
-- 处置收益被算成费用。**两处必须同改**，这是 049 遗留的双事实来源，
-- 已写进交付说明。

-- ── 一、腾 sort_order ───────────────────────────────────────────────
--
-- 1606 要排在 1602（12）之后、1701（13）之前 → 占 13，13 及以后整体后移。
-- 6115 要排在 6111（060 腾位后为 71）之后、6301（72）之前 → 占 73，
-- 也就是原先 >= 72 的再多移一位。
--
-- 一条 CASE 一次完成，避免两次 UPDATE 互相把对方刚移过的行再移一遍。
-- 只移 source='system'：用户自建科目取 max(sort_order)+1 排在最后，不该被挪动。
update account_templates set sort_order = sort_order + case
  when sort_order >= 72 then 2
  when sort_order >= 13 then 1
  else 0
end
where template_key = 'default' and sort_order >= 13;

update accounts set sort_order = sort_order + case
  when sort_order >= 72 then 2
  when sort_order >= 13 then 1
  else 0
end, updated_at = now()
where source = 'system' and sort_order >= 13;

-- ── 二、补齐科目模板 ────────────────────────────────────────────────
insert into account_templates (code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
select t.code, t.name, t.category, t.account_type, t.direction, t.parent_code, t.is_leaf, t.sort_order
from (values
  -- 固定资产清理：direction 记 debit，因为转入清理时借记净值，是它的常态余额方向。
  -- 处置完成后余额应结平，长期挂账说明有资产处置没走完流程 —— 这本身是个可查的信号。
  ('1606','固定资产清理','asset','asset_disposal_clearing','debit',null,true,13),
  -- 资产处置损益：收益贷记、损失借记，故 direction 为 credit。
  ('6115','资产处置损益','revenue','income_asset_disposal','credit',null,true,73)
) as t(code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
on conflict (template_key, code) do nothing;

-- ── 三、已存在的公司补齐 ────────────────────────────────────────────
do $$
declare c record;
begin
  for c in select id from companies loop
    perform seed_company_accounts(c.id);
  end loop;
end $$;
