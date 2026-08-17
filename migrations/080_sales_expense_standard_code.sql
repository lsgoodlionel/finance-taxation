-- V12-D6 第二步：`6201 销售费用 → 6601`，把 D3 剩下的最后一项做完。
--
-- D3（迁移 070）国标化时，`6201` 是唯一没改的科目——它的国标编码 `6601` 被
-- 「职工薪酬（成本）」占着，而那个科目的设置本身存疑、不能贸然动。迁移 079 查清
-- 并废弃了它，`6601` 现在空了。
--
-- ## 与 070 不同：这次不需要两阶段
--
-- 070 要两阶段是因为存在**占用链**（`6001c→6401` 与 `6401→6603` 互换），
-- PostgreSQL 的唯一约束默认 `NOT DEFERRABLE`、逐行即时检查，同一条 UPDATE 里
-- 换不过来。这次 `6601` 已被 079 删除，单向改写即可。
--
-- 分成两个迁移文件而不是一个：079 是**语义变更**（废弃一个科目），080 是**纯改名**。
-- 若 080 需要回退，079 不该跟着回退。

do $$
declare
  moved   integer;
  total   integer := 0;
  leftover record;
begin
  -- 前置检查：6601 必须是空的。079 没跑过就执行本迁移会直接撞唯一约束，
  -- 报出来的错是「duplicate key」——对着那句话根本看不出是漏了一个迁移。
  if exists (select 1 from account_templates where code = '6601') then
    raise exception '6601 仍存在于 account_templates。本迁移依赖 079 先废弃它，请检查迁移顺序。';
  end if;

  -- ── 数据列：8 处 ────────────────────────────────────────────────
  -- 清单来自 code-standardization.ts 的 CODE_BEARING_COLUMNS（D3 用
  -- information_schema 实测扫出来的），直接复用，不凭印象重列。
  --
  -- **不改 account_name**：与 079 不同，这次科目的业务含义完全没变，只是编码换了。
  -- 分录上写着「销售费用-差旅费」这类描述性细化是合理的、比科目标准名更有信息量
  -- （041 已记录过这个判断），一律改成「销售费用」反而丢信息。
  update ledger_entries set account_code = '6601' where account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  update voucher_lines set account_code = '6601' where account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  update voucher_draft_lines set account_code = '6601' where account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  update recurring_voucher_lines set account_code = '6601' where account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  update bank_accounts set account_code = '6601' where account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  update fixed_assets set asset_account_code = '6601' where asset_account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;
  update fixed_assets set accumulated_account_code = '6601' where accumulated_account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;
  update fixed_assets set expense_account_code = '6601' where expense_account_code = '6201';
  get diagnostics moved = row_count; total := total + moved;

  raise notice 'D6: 6201 → 6601 改写 % 行数据', total;

  -- ── 科目定义：code / parent_code / path / id ────────────────────
  --
  -- `path` 是 ltree、`id` 是 `company_id || ':' || code`，两者都含编码，必须重建
  -- 而不是字符串替换（070 的教训：替换会在长度变化时破坏 ltree 层级）。
  -- 这次 6201 是一级叶子科目，path 就是它自己。
  update account_templates set code = '6601' where code = '6201';
  update account_templates set parent_code = '6601' where parent_code = '6201';

  update accounts
     set code = '6601',
         path = '6601'::ltree,
         id = company_id || ':6601',
         updated_at = now()
   where code = '6201';
  update accounts set parent_code = '6601' where parent_code = '6201';

  -- ── 零残留自检 ──────────────────────────────────────────────────
  for leftover in
    select 'account_templates' as src from account_templates where code = '6201' or parent_code = '6201'
    union all select 'accounts' from accounts where code = '6201' or parent_code = '6201'
    union all select 'ledger_entries' from ledger_entries where account_code = '6201'
    union all select 'voucher_lines' from voucher_lines where account_code = '6201'
    union all select 'voucher_draft_lines' from voucher_draft_lines where account_code = '6201'
    union all select 'recurring_voucher_lines' from recurring_voucher_lines where account_code = '6201'
    union all select 'bank_accounts' from bank_accounts where account_code = '6201'
    union all select 'fixed_assets' from fixed_assets
      where asset_account_code = '6201' or accumulated_account_code = '6201' or expense_account_code = '6201'
  loop
    raise exception '6201 在 % 中仍有残留，迁移回滚。', leftover.src;
  end loop;
end $$;

comment on column accounts.code is
  '科目编码，已全部按《企业会计准则——应用指南》国标化（V12-D3 迁移 070 + D6 迁移 080）。'
  '070 之后只剩销售费用 6201 未改——它的国标编码 6601 被「职工薪酬（成本）」占着，'
  '而那个科目的设置本身存疑。079 查清并废弃了它（零分录、零余额，只是「工资借方该挂'
  '哪里」这个判断的占位符），080 随即把 6201 改成 6601。至此无遗留非国标编码。';
