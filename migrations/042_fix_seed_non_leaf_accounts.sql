-- 修正 015 种子数据中记账到「非叶子科目」的分录。
--
-- 041 已把 015 的国标 2006 编号错配（5001/4001/6602 …）映射回本系统的科目表，
-- 但漏了另一类问题：**码本身存在于科目表、却是非叶子科目**。
--
-- 应付职工薪酬 2211 在 chart-of-accounts.ts 里 isLeaf=false，其下有
-- 22110101（工资）/ 22110102（社保·单位）/ 22110103（公积金·单位）三个叶子。
-- 记账到父级科目的后果：
--   * 与子科目重复计量 —— 按 `2211%` 前缀汇总时父级自身的余额会被再加一次；
--   * 科目选择器只列叶子（accounts/routes.ts），用户在 UI 上根本选不到 2211，
--     种子数据却用了它，形成「界面上做不出来的账」；
--   * 社保稽核对账无法区分工资、社保、公积金三部分。
--
-- 运行时侧已在同一轮修复（vouchers/templates.ts、events/routes.ts 等改记
-- 22110101/22110102/22110103），本迁移只补历史种子数据。
--
-- ── 映射表（只改 account_code，保留 account_name）────────────────────────────
--  现码    分录 account_name      新码        科目表中的名称
--  2211    应付职工薪酬           22110101    应付职工薪酬-工资
--
-- 该条分录是 2026-04-30 的工资计提（贷 86,000），归入「工资」子科目。
--
-- 幂等性：与 041 同一策略 —— 匹配 (account_code, account_name) 精确等值对，
-- 新旧码必然不同，重复执行影响 0 行；不使用 like / 前缀匹配。

do $$
declare
  target_table text;
  mapping      record;
  affected     integer;
  table_total  integer;
begin
  foreach target_table in array array['ledger_entries', 'voucher_lines', 'voucher_draft_lines']
  loop
    table_total := 0;

    for mapping in
      select *
        from (values
          ('2211', '应付职工薪酬', '22110101')
        ) as m(old_code, account_name, new_code)
    loop
      execute format(
        'update %I set account_code = $1 where account_code = $2 and account_name = $3',
        target_table
      ) using mapping.new_code, mapping.old_code, mapping.account_name;

      get diagnostics affected = row_count;
      table_total := table_total + affected;
    end loop;

    raise notice '042_fix_seed_non_leaf_accounts: % 更新 % 行', target_table, table_total;
  end loop;
end $$;
