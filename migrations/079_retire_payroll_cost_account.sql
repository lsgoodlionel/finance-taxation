-- V12-D6 第一步：废弃 `6601 职工薪酬（成本）`。
--
-- 方案与完整证据见 docs/v12-d6-payroll-cost-account-retirement-plan.md。
--
-- ## 它不承载任何业务
--
-- `6601` 不对应任何会计科目，是「工资计提的借方该挂哪里」这个判断的占位符。
-- 职工薪酬的贷方（`22110101` 应付职工薪酬-工资）本来就是对的，错的只有借方。
--
-- 四条判据：
--
-- 1. 真正的工资链路（`payroll/social-security-vouchers.ts`）从不用它，而通用凭证
--    模板与业务事项草稿用它——**同一件业务事实，科目取决于用户从哪个入口进来**；
-- 2. `name` 写「（成本）」而 `category` 是 `expense`，码、名、语义三者不一致；
-- 3. 四处独立错账同一根因（差旅费、采购报销、预算差异、老板问答），现存注释是疤；
-- 4. 库里 8 个存科目码的列**行数全为 0**（本迁移执行前实测确认），唯一一条历史
--    分录早在迁移 041 就被改到了 `6201`——上一次有人认真判断「这笔挂 6601 的钱到底
--    是什么」时，答案是「销售费用」。
--
-- ## 借方改挂 660208 管理费用-工资
--
-- **不挂 `4001` 生产成本**：教科书答案是生产人员工资进生产成本，但 FT 不做成本
-- 结转（蓝图「明确不引入清单」已排除，它需要产量与在产品数据），而
-- `classifyProfitAccount` 对 `category: "cost"` 返回 `other`、`summarizeProfitTotals`
-- 对 `other` 既不计收入也不计费用——挂 4001 会让工资**永远不进利润表**，比现状更糟。
--
-- 落点是 `660208` 而不是方案初稿写的 `660201`：迁移 077 收口管理费用名称错位时
-- 才发现 `660201` 在库里是「办公费」，并新增了 `660208 管理费用-工资`。

do $$
declare
  moved   integer;
  total   integer := 0;
  leftover record;
begin
  -- ── 一、改挂存量数据 ────────────────────────────────────────────
  --
  -- 种子库是 0 行，但客户库里可能有会计手工挂上去的分录。**自动改挂而不是报错
  -- 终止**：让迁移失败会把部署卡在一份迁移自己修不了的数据上，而这里的自动改写
  -- 是安全的——
  --
  -- - `6601` 与 `660208` **同为 `category: 'expense'`**，`summarizeProfitTotals`
  --   的 expense 档不变 → **利润总额与净利润一分不动**，只有费用明细构成会变；
  -- - 风控的工资分录检测不会漏：`risk/engine.ts` 已同时认 `22110101` 与管理费用
  --   工资明细，去掉 6601 分支后检测能力不降反升。
  --
  -- 名称一并改掉：`6601` 上的分录名多半写着「管理费用」或「职工薪酬」，留着会让
  -- 账簿上出现「名称说管理费用、科目是管理费用-工资」的半吊子状态。
  update ledger_entries set account_code = '660208', account_name = '管理费用-工资'
   where account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  update voucher_lines set account_code = '660208', account_name = '管理费用-工资'
   where account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  update voucher_draft_lines set account_code = '660208', account_name = '管理费用-工资'
   where account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  update recurring_voucher_lines set account_code = '660208', account_name = '管理费用-工资'
   where account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  update bank_accounts set account_code = '660208' where account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  update fixed_assets set asset_account_code = '660208' where asset_account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;
  update fixed_assets set accumulated_account_code = '660208' where accumulated_account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;
  update fixed_assets set expense_account_code = '660208' where expense_account_code = '6601';
  get diagnostics moved = row_count; total := total + moved;

  -- 不静默：改了多少行要能在部署日志里看见。
  raise notice 'D6: 6601 → 660208 改挂 % 行（种子库应为 0）', total;

  -- ── 二、删除科目定义 ────────────────────────────────────────────
  --
  -- 断言优先于注释：当前 6601 没有子科目，但断言能保证将来也没有。
  if exists (select 1 from account_templates where parent_code = '6601') then
    raise exception '6601 仍有子科目，删除会产生孤儿节点。';
  end if;
  if exists (select 1 from accounts where parent_code = '6601') then
    raise exception '某公司的 6601 仍有子科目，删除会产生孤儿节点。';
  end if;

  delete from accounts where code = '6601';
  delete from account_templates where code = '6601';

  -- ── 三、零残留自检 ──────────────────────────────────────────────
  for leftover in
    select 'account_templates' as src, code as c from account_templates where code = '6601'
    union all select 'accounts', code from accounts where code = '6601'
    union all select 'ledger_entries', account_code from ledger_entries where account_code = '6601'
    union all select 'voucher_lines', account_code from voucher_lines where account_code = '6601'
    union all select 'voucher_draft_lines', account_code from voucher_draft_lines where account_code = '6601'
    union all select 'recurring_voucher_lines', account_code from recurring_voucher_lines where account_code = '6601'
    union all select 'bank_accounts', account_code from bank_accounts where account_code = '6601'
    union all select 'fixed_assets', asset_account_code from fixed_assets where asset_account_code = '6601'
    union all select 'fixed_assets', accumulated_account_code from fixed_assets where accumulated_account_code = '6601'
    union all select 'fixed_assets', expense_account_code from fixed_assets where expense_account_code = '6601'
  loop
    raise exception '6601 在 % 中仍有残留，迁移回滚。', leftover.src;
  end loop;
end $$;
