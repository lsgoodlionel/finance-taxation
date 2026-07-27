-- 修正 015_startup_year1_simulation 种子数据的科目编码错配。
--
-- 015 整份种子数据按【国标 2006 会计科目编号】书写（收入 5xxx、权益 4xxx、
-- 管理费用 6602、研发费用 6401 …），而本系统的科目主数据
-- （apps/api/src/modules/accounts/chart-of-accounts.ts）用的是另一套自定义编码
-- （收入 6001/6051、权益 3001、管理费用 6301e 系列 …）。两套编号混用的后果：
--
--   * 报表按科目码取数，落在科目表之外的码被归入「other」而静默丢弃 ——
--     主营业务收入 188,679 与其他业务收入 100,000 在利润表上恒为 0；
--   * 4001 在本系统的科目表里是「生产成本」（category=cost），于是实收资本
--     500,000 既进不了权益、也不进损益，直接从资产负债表消失，报表不配平
--     （全年口径差额 788,679 = 500,000 + 288,679）；
--   * 6401/6601/2203 这几个码在科目表里存在但指向完全不同的科目，金额虽然
--     还在，科目归属与分录上的中文名却自相矛盾（分录写「研发费用-外包」，
--     科目表说 6401 是财务费用）。
--
-- 015 已在既有环境跑过，migration runner 不会重跑它，因此只能用本迁移做 UPDATE。
--
-- ── 映射表（只改 account_code，保留 account_name）────────────────────────────
--  现码    分录 account_name          新码       科目表中的名称
--  1231    其他应收款                 1221       其他应收款
--  2203    应交税费-增值税销项         222101     应交税费-应交增值税（销项）
--  4001    实收资本                   3001       实收资本
--  5001    主营业务收入               6001       主营业务收入
--  5051    其他收益                   6051       其他业务收入
--  6401    研发费用-人工              6301e06    管理费用-研发费用
--  6401    研发费用-外包              6301e06    管理费用-研发费用
--  6601    销售费用-工资              6201       销售费用
--  6602    管理费用-工资              6301e01    管理费用-工资
--  6602    管理费用-租金              6301e03    管理费用-办公费
--
-- account_name 是描述性冗余字段，现有值已是准确的业务描述（「销售费用-工资」是
-- 对 6201 销售费用的细化），比科目表的标准名更有信息量，故一律保留不动。
--
-- 三张表都要改：ledger_entries（总账，报表取数口径）、voucher_lines（凭证行）、
-- voucher_draft_lines（草稿行）。只改总账会让凭证与总账对不上。
--
-- 幂等性：匹配条件是 (account_code, account_name) 的**精确等值对**，且新码与旧码
-- 必然不同 —— 第一次执行后再无行满足 account_code = 旧码，重复执行影响 0 行。
-- 不使用 like / 前缀 / 模糊匹配，1002 / 1601 / 2001 / 2211 等本来正确的码不受影响；
-- 若将来有人以「生产成本」之名合法使用 4001，也因 account_name 不匹配而不被误伤。

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
          ('1231', '其他应收款',          '1221'),
          ('2203', '应交税费-增值税销项', '222101'),
          ('4001', '实收资本',            '3001'),
          ('5001', '主营业务收入',        '6001'),
          ('5051', '其他收益',            '6051'),
          ('6401', '研发费用-人工',       '6301e06'),
          ('6401', '研发费用-外包',       '6301e06'),
          ('6601', '销售费用-工资',       '6201'),
          ('6602', '管理费用-工资',       '6301e01'),
          ('6602', '管理费用-租金',       '6301e03')
        ) as m(old_code, account_name, new_code)
    loop
      execute format(
        'update %I set account_code = $1 where account_code = $2 and account_name = $3',
        target_table
      ) using mapping.new_code, mapping.old_code, mapping.account_name;

      get diagnostics affected = row_count;
      table_total := table_total + affected;
    end loop;

    raise notice '041_fix_seed_account_codes: % 更新 % 行', target_table, table_total;
  end loop;
end $$;
