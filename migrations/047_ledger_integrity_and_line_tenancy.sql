-- V12-A7 + A9：把两条一直靠「大家记得」维持的不变量下沉到数据库。
--
-- ## A7 总账分录的借贷完整性
--
-- ledger_entries 此前没有任何 CHECK：负数金额、同一行既有借又有贷，数据库都照收。
-- 应用层的借贷平衡校验只在 postVoucher 里，而 closePeriod 直接 insert 绕过了它
-- （A3 正在修）。约束下沉之后，任何路径——包括将来新增的、包括直接连库的运维
-- 脚本——都无法写入结构性非法的分录。
--
-- 「单侧非零」这条取自 Odoo 的 account_move_line：它在 DB 层有
-- CHECK(credit * debit = 0)，保证落库的分录永远只有一侧有值。同一行既借又贷在
-- 复式记账里没有意义，允许它只会让下游每个聚合逻辑都要处理这种形状。
--
-- ## A9 voucher_lines 的租户隔离
--
-- 039 给 5 张核心表加了 RLS，但 voucher_lines 不在其中——因为它**根本没有
-- company_id 列**，只能靠 voucher_id 外键间接归属。这意味着凭证分录这张表
-- 在数据库层没有任何租户边界。
--
-- 补列 + 回填 + RLS，与 039 保持同一套策略（ENABLE 不 FORCE，属主绕过，
-- 隔离在应用以非属主 app 角色连接时生效）。

-- ── A7：分录结构性约束 ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ledger_entries_nonneg_check') then
    alter table ledger_entries
      add constraint ledger_entries_nonneg_check check (debit >= 0 and credit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_entries_single_side_check') then
    alter table ledger_entries
      add constraint ledger_entries_single_side_check check (debit = 0 or credit = 0);
  end if;
  -- 凭证分录同理：它是总账分录的来源，形状非法的分录不该等到过账才被发现
  if not exists (select 1 from pg_constraint where conname = 'voucher_lines_nonneg_check') then
    alter table voucher_lines
      add constraint voucher_lines_nonneg_check check (debit >= 0 and credit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'voucher_lines_single_side_check') then
    alter table voucher_lines
      add constraint voucher_lines_single_side_check check (debit = 0 or credit = 0);
  end if;
end $$;

-- ── A9：voucher_lines 补租户列 ──────────────────────────────────────
alter table voucher_lines add column if not exists company_id text;

update voucher_lines vl
set company_id = v.company_id
from vouchers v
where v.id = vl.voucher_id and vl.company_id is null;

-- 理论上不会有孤儿行（voucher_id 有 on delete cascade 的外键），此处仅为防御：
-- 若真有，NOT NULL 会失败并暴露问题，好过让它们悄悄躺在无租户归属的状态。
alter table voucher_lines alter column company_id set not null;

-- company_id 由触发器从所属凭证派生，而不是要求每个插入点自己传。
--
-- 这是刻意的设计选择：全仓有 8 处插入 voucher_lines（生产代码、种子迁移、
-- 测试夹具），让每一处都记得填同一个派生值，遗漏是必然的——而且一旦某处填错
-- 公司，RLS 就会把这行分录隔离到错误的租户下，比没有隔离更危险。
--
-- company_id 完全由 voucher_id 决定，属派生数据，应当由数据库计算。
-- 显式传值仍被尊重（COALESCE 保留非空入参），但没传时自动补齐。
create or replace function voucher_lines_fill_company_id() returns trigger as $$
begin
  if new.company_id is null then
    select v.company_id into new.company_id from vouchers v where v.id = new.voucher_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_voucher_lines_fill_company_id on voucher_lines;
create trigger trg_voucher_lines_fill_company_id
  before insert or update of voucher_id on voucher_lines
  for each row execute function voucher_lines_fill_company_id();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'voucher_lines_company_id_fkey'
  ) then
    alter table voucher_lines
      add constraint voucher_lines_company_id_fkey
      foreign key (company_id) references companies(id);
  end if;
end $$;

create index if not exists idx_voucher_lines_company on voucher_lines (company_id);

-- 与 039 同一套租户策略
alter table voucher_lines enable row level security;
drop policy if exists voucher_lines_tenant_isolation on voucher_lines;
create policy voucher_lines_tenant_isolation on voucher_lines
  for all
  using (company_id = current_setting('app.current_company', true))
  with check (company_id = current_setting('app.current_company', true));
