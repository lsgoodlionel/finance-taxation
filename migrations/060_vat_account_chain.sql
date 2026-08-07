-- V12-B8：增值税科目链条补全（蓝图 F4）。
--
-- ## 问题
--
-- 049 seed 的 2221 下只有 6 个二级科目，增值税部分只有「销项」222101 与
-- 「进项」222102 两个。这两个科目会一直挂着不动：没有「未交增值税」，
-- **月末「结转未交增值税」这一步根本无科目可用**。
--
-- 后果不是少一张凭证，而是资产负债表上「应交税费」的余额永远是销项与进项
-- 两个孤立数字的代数和，而不是「本月到底该缴多少税」。销项 1000 / 进项 300
-- 与销项 700 / 进项 0 在报表上完全一样，但前者已经缴过 300 的税、后者没有。
-- 税务申报与账簿之间因此没有任何可勾稽的落点。
--
-- 标准月末分录（财会〔2016〕22 号《增值税会计处理规定》）：
--     借 应交税费-应交增值税（转出未交增值税）
--     贷 应交税费-未交增值税
--
-- ## 四个参考系统都抄不到
--
-- Odoo / ERPNext / GnuCash / Akaunting 都没有中国增值税的科目体系。Odoo 的
-- `l10n_cn` 是四个里最细的（2221 下 27 个明细），**科目清单**照搬自它与
-- 财会〔2016〕22 号；但它的税率 CSV 只有 13/9/6 三档且全记一级科目，
-- 质量低于 FT 现有 tax 模块，不参考。
--
-- ## 为什么不做成三级科目
--
-- 财会〔2016〕22 号的正统结构是三级：「应交税费」下设「应交增值税」等二级明细，
-- 「应交增值税」再下设进项税额/销项税额/转出未交增值税等**专栏**（三级）；
-- 而「未交增值税」「预交增值税」「简易计税」是与「应交增值税」并列的二级明细，
-- 不参与专栏轧差。
--
-- FT 现有的 222101/222102 已经把「应交增值税」这一层压扁了 —— 它们的
-- parent_code 直接是 2221。要恢复三级就得给这两个既有科目改 parent_code 与
-- ltree path，而它们上面已经挂着历史分录。**这属于编码体系问题，与蓝图 D3
-- 「科目编码国标化迁移」是同一件事，应当一起做，不在本次拆开。**
--
-- 本次改用 `account_type` 承载「哪些是应交增值税的专栏、哪个是未交增值税」
-- 这层语义 —— 这正是 049 引入 account_type 的目的：让业务规则不必硬编码科目码。
-- 结转逻辑（modules/tax/vat-accounts.ts）按 account_type 解析科目，
-- 将来 D3 把编码换成 222101→2221.01 之类的国标编码时，代码一行都不用改。
--
-- account_type 一律以 `liability_tax` 为前缀，任何既有的
-- `startsWith('liability_tax')` 判定都不受影响。

-- ── 一、给新科目腾出 sort_order ─────────────────────────────────────
--
-- 049 里 222106 占 34、紧跟着的 2231 占 35。新增 9 个科目要排在 222106 之后、
-- 2231 之前，所以把 35 及以后整体后移 9 位。sort_order 只影响科目列表的展示
-- 顺序（account-store.ts 是 `order by sort_order asc, code asc`），无业务语义。
--
-- 只移 source='system' 的行：用户自建科目取 max(sort_order)+1，它们排在最后，
-- 不该被这次腾位挪动。
update account_templates set sort_order = sort_order + 9
where template_key = 'default' and sort_order >= 35;

update accounts set sort_order = sort_order + 9, updated_at = now()
where source = 'system' and sort_order >= 35;

-- ── 二、补齐科目模板 ────────────────────────────────────────────────
--
-- direction 记的是该科目**余额的正常方向**，不是某一笔分录的方向：
-- 「转出未交增值税」平时只会被借记（把应交增值税的贷方余额转平），故为 debit；
-- 「转出多交增值税」只会被贷记，故为 credit。
insert into account_templates (code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
select t.code, t.name, t.category, t.account_type, t.direction, t.parent_code, t.is_leaf, t.sort_order
from (values
  -- 应交增值税的专栏（期末要与销项/进项一起轧差）
  --
  -- 进项税额转出：已抵扣的进项因非正常损失、改用于简易计税项目/免税项目/
  -- 集体福利个人消费而必须转出。贷记本科目，等于把当初的抵扣冲回，本月应缴增加。
  ('222107','应交税费-应交增值税（进项税额转出）','liability','liability_tax_vat_input_transfer_out','credit','2221',true,35),
  -- 已交税金：**当月缴纳当月**增值税时借记（月内多次申报、查补当月税款）。
  -- 缴纳上月税款走「未交增值税」，不进这里 —— 两者混用会让轧差多算一遍。
  ('222108','应交税费-应交增值税（已交税金）','liability','liability_tax_vat_paid','debit','2221',true,36),
  -- 转出未交增值税 / 转出多交增值税：月末轧差的两个出口，只在结转凭证里出现。
  ('222109','应交税费-应交增值税（转出未交增值税）','liability','liability_tax_vat_transfer_unpaid','debit','2221',true,37),
  ('222110','应交税费-应交增值税（转出多交增值税）','liability','liability_tax_vat_transfer_overpaid','credit','2221',true,38),

  -- 与「应交增值税」并列的二级明细（不参与专栏轧差）
  --
  -- 未交增值税 ← 本次最关键的一个。月末结转后它的贷方余额就是「本月应缴未缴」，
  -- 借方余额是「多缴待抵」。次月申报缴纳时借记本科目。
  ('222111','应交税费-未交增值税','liability','liability_tax_vat_unpaid','credit','2221',true,39),
  -- 预交增值税：异地提供建筑服务、销售不动产、房地产预售等情形的预缴。
  -- 月末转入未交增值税（借 未交增值税 / 贷 预交增值税）。
  ('222112','应交税费-预交增值税','liability','liability_tax_vat_prepaid','debit','2221',true,40),
  -- 待认证进项税额：已取得专票但尚未勾选认证。认证通过后转入 222102。
  -- 有它才能解释「拿到票了但这个月抵不了」，而不是把未认证的票直接抵扣。
  ('222113','应交税费-待认证进项税额','liability','liability_tax_vat_pending_certification','debit','2221',true,41),
  -- 待抵扣进项税额：已认证但按规定分期抵扣（如不动产分期抵扣的存量规则）。
  ('222114','应交税费-待抵扣进项税额','liability','liability_tax_vat_deferred_input','debit','2221',true,42),
  -- 简易计税：一般纳税人简易计税项目的计提/扣减/预缴/缴纳都在这里核算，
  -- **不进应交增值税的专栏**，因此也不参与月末轧差。
  ('222115','应交税费-简易计税','liability','liability_tax_vat_simplified','credit','2221',true,43)
) as t(code, name, category, account_type, direction, parent_code, is_leaf, sort_order)
on conflict (template_key, code) do nothing;

-- ── 三、给既有的销项/进项贴上语义标签 ───────────────────────────────
--
-- 只改 account_type 仍为初始值 'liability_tax' 的行 —— 用户若已自行调整过，
-- 尊重用户的值，不覆盖。
update account_templates set account_type = 'liability_tax_vat_output'
where template_key = 'default' and code = '222101' and account_type = 'liability_tax';
update account_templates set account_type = 'liability_tax_vat_input'
where template_key = 'default' and code = '222102' and account_type = 'liability_tax';

update accounts set account_type = 'liability_tax_vat_output', updated_at = now()
where code = '222101' and account_type = 'liability_tax';
update accounts set account_type = 'liability_tax_vat_input', updated_at = now()
where code = '222102' and account_type = 'liability_tax';

-- ── 四、已存在的公司补齐 ────────────────────────────────────────────
--
-- 新建公司由 049 的触发器自动 seed，模板已更新即可；已有公司要显式补一遍。
-- seed_company_accounts 带 on conflict do nothing，只会补进新增的 9 条。
-- 写法照抄 049 末尾。
do $$
declare c record;
begin
  for c in select id from companies loop
    perform seed_company_accounts(c.id);
  end loop;
end $$;

comment on column accounts.account_type is
  '业务语义标签，驱动「能否核销/是否结转期初/是不是本年利润/增值税结转取哪些科目」等规则。'
  '与 category（报表口径）并存：account_type 可推出 category，反之不行。';
