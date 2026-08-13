-- V12-D3：科目编码国标化（数据侧）。
--
-- 方案见 docs/v12-d3-account-code-standardization-plan.md，映射表的唯一事实来源是
-- apps/api/src/modules/accounts/code-standardization.ts —— 本迁移的映射必须与它一致。
--
-- ## 为什么必须两阶段
--
-- `6001c`（主营业务成本）的国标编码是 `6401`，而 FT 已经把 `6401` 用作「财务费用」。
-- 一条 UPDATE 里同时把 `6001c→6401`、`6401→6603` 会在中间态撞唯一约束 ——
-- PostgreSQL 的唯一约束默认 `NOT DEFERRABLE`，逐行即时检查，不等语句结束。
--
-- 所以先把全部受影响编码挪到带前缀的临时值（`__d3__6401`），再统一落到目标值。
-- 临时值带双下划线前缀，与任何真实编码都不可能相同。
--
-- ## `accounts.path` 与 `accounts.id` 必须重建，不能字符串替换
--
-- `path` 是 ltree，由 `parent_code.code` 拼成。`6301e01 → 660201` 长度变了，
-- 字符串替换会破坏层级结构。`id` 是 `company_id || ':' || code`，同理。
-- 两者都在编码落位后按新值整体重算。

do $$
declare
  mapping record;
  offender record;
  total bigint := 0;
begin
  -- 映射表：(旧编码, 新编码)。与 code-standardization.ts 的 ACCOUNT_CODE_MAPPINGS 一一对应。
  create temporary table d3_code_map (legacy text primary key, standard text not null) on commit drop;
  insert into d3_code_map (legacy, standard) values
    ('6001c', '6401'),
    ('6301e', '6602'),
    ('6301e01', '660201'),
    ('6301e02', '660202'),
    ('6301e03', '660203'),
    ('6301e04', '660204'),
    ('6301e05', '660205'),
    ('6301e06', '660206'),
    ('6301e07', '660207'),
    ('6401', '6603'),
    ('6401001', '660301'),
    ('6401002', '660302'),
    ('6101', '6403'),
    ('3131', '4103'),
    ('3141', '4104');

  -- ── 前置检查：目标编码不得已被无关科目占用 ─────────────────────────
  --
  -- 占用链内部的互换是预期的（6401 既是目标也是来源），要排除掉再检查。
  for offender in
    select a.code, a.name from accounts a
    join d3_code_map m on m.standard = a.code
    where a.code not in (select legacy from d3_code_map)
  loop
    raise exception
      '目标编码 % 已被「%」占用，且它不在改写链内。请先确认该科目的去向再执行本迁移。',
      offender.code, offender.name;
  end loop;

  -- ── 第一阶段：全部挪到临时编码 ────────────────────────────────────
  for mapping in select legacy, standard from d3_code_map loop
    update account_templates set code = '__d3__' || mapping.standard where code = mapping.legacy;
    update account_templates set parent_code = '__d3__' || mapping.standard where parent_code = mapping.legacy;
    update accounts set code = '__d3__' || mapping.standard where code = mapping.legacy;
    update accounts set parent_code = '__d3__' || mapping.standard where parent_code = mapping.legacy;
    update ledger_entries set account_code = '__d3__' || mapping.standard where account_code = mapping.legacy;
    update voucher_lines set account_code = '__d3__' || mapping.standard where account_code = mapping.legacy;
    update voucher_draft_lines set account_code = '__d3__' || mapping.standard where account_code = mapping.legacy;
    update recurring_voucher_lines set account_code = '__d3__' || mapping.standard where account_code = mapping.legacy;
    update bank_accounts set account_code = '__d3__' || mapping.standard where account_code = mapping.legacy;
    update fixed_assets set asset_account_code = '__d3__' || mapping.standard where asset_account_code = mapping.legacy;
    update fixed_assets set accumulated_account_code = '__d3__' || mapping.standard where accumulated_account_code = mapping.legacy;
    update fixed_assets set expense_account_code = '__d3__' || mapping.standard where expense_account_code = mapping.legacy;
  end loop;

  -- ── 第二阶段：去掉临时前缀，落到目标编码 ──────────────────────────
  update account_templates set code = replace(code, '__d3__', '') where code like '__d3__%';
  update account_templates set parent_code = replace(parent_code, '__d3__', '') where parent_code like '__d3__%';
  update accounts set code = replace(code, '__d3__', '') where code like '__d3__%';
  update accounts set parent_code = replace(parent_code, '__d3__', '') where parent_code like '__d3__%';
  update ledger_entries set account_code = replace(account_code, '__d3__', '') where account_code like '__d3__%';
  update voucher_lines set account_code = replace(account_code, '__d3__', '') where account_code like '__d3__%';
  update voucher_draft_lines set account_code = replace(account_code, '__d3__', '') where account_code like '__d3__%';
  update recurring_voucher_lines set account_code = replace(account_code, '__d3__', '') where account_code like '__d3__%';
  update bank_accounts set account_code = replace(account_code, '__d3__', '') where account_code like '__d3__%';
  update fixed_assets set asset_account_code = replace(asset_account_code, '__d3__', '') where asset_account_code like '__d3__%';
  update fixed_assets set accumulated_account_code = replace(accumulated_account_code, '__d3__', '') where accumulated_account_code like '__d3__%';
  update fixed_assets set expense_account_code = replace(expense_account_code, '__d3__', '') where expense_account_code like '__d3__%';

  -- ── 重建 path 与 id ───────────────────────────────────────────────
  --
  -- id 同样要两阶段。它是 `company_id || ':' || code`，而编码之间发生了互换：
  -- 6001c 的新 id 是 `cmp:6401`，恰好是财务费用**尚未更新**时的旧 id。
  -- 一条 UPDATE 逐行改会在中途撞主键（实测撞过一次）。
  -- 先全部加临时前缀让旧 id 集体让位，再落到目标值。
  update accounts set id = '__d3__' || id;
  update accounts
     set path = (coalesce(parent_code || '.', '') || code)::ltree,
         id = company_id || ':' || code,
         updated_at = now();

  -- ── 自检：零残留 ──────────────────────────────────────────────────
  --
  -- 宁可迁移失败回滚，不要一半新一半旧 —— 那种状态下科目查不到、报表少数据，
  -- 而且很难回头查是哪一半没改。
  select count(*) into total from (
    select code as c from account_templates
    union all select parent_code from account_templates
    union all select code from accounts
    union all select parent_code from accounts
    union all select account_code from ledger_entries
    union all select account_code from voucher_lines
    union all select account_code from voucher_draft_lines
    union all select account_code from recurring_voucher_lines
    union all select account_code from bank_accounts
    union all select asset_account_code from fixed_assets
    union all select accumulated_account_code from fixed_assets
    union all select expense_account_code from fixed_assets
  ) all_codes
  -- 占用链里的编码两头都在：`6401` 既是财务费用的**旧码**，又是主营业务成本的
  -- **新码**。只按 legacy 判会把正确落位的 6401 误报成残留（初版就是这么错的，
  -- 自检报了 2 处「残留」而数据其实是对的）。
  -- 真正的残留判据是「在 legacy 里**且不在** standard 里」。
  where (c in (select legacy from d3_code_map where legacy not in (select standard from d3_code_map)))
     or c like '__d3__%';

  if total > 0 then
    raise exception 'D3 编码改写后仍有 % 处旧编码或临时编码残留，迁移回滚。', total;
  end if;
end $$;

-- 科目名称里的编码提示也要跟上（`6001c` 这类自造编码没有出现在名称里，
-- 但注释里的说明要改，见 comment）。
comment on column accounts.code is
  '科目编码，已按《企业会计准则——应用指南》国标化（V12-D3，迁移 070）。'
  '此前的 6001c / 6301e 与 6001 / 6301 前缀重叠，逼得每处前缀判定都要「先排除」，'
  '漏一次就是利润表反向。现在 6401 / 6602 与它们无前缀关系，那些特例已删除。'
  '仍未国标化的：6201 销售费用（目标编码 6601 被「职工薪酬（成本）」占用，'
  '而后者的科目设置本身存疑，需独立立项）。';
