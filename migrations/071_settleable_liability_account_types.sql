-- V12 残留 8：把负债侧的往来科目从泛化的 `liability_current` 里挪出来。
--
-- ## 049 的单边疏漏
--
-- 049 定 `account_type` 时，资产侧把四个往来科目一并归进了 `asset_receivable`
-- （1121 应收票据、1122 应收账款、1131 应收利息、1221 其他应收款），负债侧的
-- `liability_payable` 却只有 2201 应付票据、2202 应付账款 —— 恰好是 1121/1122 的
-- 对称项，多出来的两个没跟上，2231 应付利息与 2241 其他应付款留在了
-- `liability_current` 这个「剩下的都扔这里」的桶里。
--
-- 2203 预收账款同理：资产侧的 1123 预付账款有专门的 `asset_prepayment`，
-- 负债侧对称的预收却没有对应类型。
--
-- ## 后果不是理论上的
--
-- `SETTLEABLE_ACCOUNT_TYPES` 按 account_type 判定谁能核销，于是这三个科目一直
-- 核销不了。而 2241 有**四条真实写入路径**（travel-expense-rules、
-- purchase-expense-rules、events/routes、vouchers/templates 都往它上面挂员工
-- 垫付款），2203 也有（contract-revenue-rules 的预收性质合同收入）。
--
-- 分录一直在产生，却查不出「谁垫了多少、还欠多少」「哪笔预收还没发货」——
-- 而员工垫付款正是最需要逐笔核销的场景之一。
--
-- ## 为什么预收单列而不并入 liability_payable
--
-- 账龄口径不同：应付是「欠了货款多久没付」，预收是「收了钱多久没发货」。这与
-- 资产侧 `asset_prepayment` 独立于 `asset_receivable` 是同一个道理，两者要在
-- 账龄表上分开呈现。

do $$
declare
  moved_advance bigint;
  moved_payable bigint;
  leftover record;
begin
  -- ── 预收账款 → 新的 liability_advance_receipt ──────────────────────
  update account_templates
     set account_type = 'liability_advance_receipt'
   where code = '2203' and account_type = 'liability_current';

  update accounts
     set account_type = 'liability_advance_receipt', updated_at = now()
   where code = '2203' and account_type = 'liability_current';
  get diagnostics moved_advance = row_count;

  -- ── 应付利息 / 其他应付款 → liability_payable ─────────────────────
  --
  -- 与资产侧 1131 应收利息、1221 其他应收款归入 `asset_receivable` 对称。
  update account_templates
     set account_type = 'liability_payable'
   where code in ('2231', '2241') and account_type = 'liability_current';

  update accounts
     set account_type = 'liability_payable', updated_at = now()
   where code in ('2231', '2241') and account_type = 'liability_current';
  get diagnostics moved_payable = row_count;

  raise notice 'V12 残留 8：预收账款 % 行、应付利息/其他应付款 % 行已改类型。',
    moved_advance, moved_payable;

  -- ── 自检：这三个科目不得再留在 liability_current ──────────────────
  --
  -- 用户自建科目（source='custom'）可能也叫这些编码却是别的性质，所以只按编码
  -- 检查模板表 —— 模板表是系统定义的，必须干净。
  for leftover in
    select code, name, account_type from account_templates
    where code in ('2203', '2231', '2241') and account_type = 'liability_current'
  loop
    -- RAISE 的格式串必须是字面量，不能用 `||` 拼接（初版就是这么挂的）。
    -- 相邻字面量靠换行拼接是词法层面的，RAISE 看到的仍是一个完整格式串。
    raise exception
      '科目 % 「%」仍是 liability_current，改类型没有生效。核销判据按 account_type 走，'
      '留在泛化桶里就等于这个科目永远核销不了。', leftover.code, leftover.name;
  end loop;
end $$;

comment on column accounts.account_type is
  '细分语义标签，驱动业务规则（能否核销、是否结转期初、年结如何处理）。'
  '与 category（报表口径）并存：account_type 可推出 category，反之不行。'
  '往来类型必须资产/负债成对出现——asset_receivable ↔ liability_payable、'
  'asset_prepayment ↔ liability_advance_receipt。单边归类会让账龄表缺一半，'
  '且不会有任何报错（迁移 071 修的就是 049 留下的这个单边疏漏）。';
