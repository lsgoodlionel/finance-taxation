-- V12-C4：定期凭证模板。
--
-- ## 为什么不挂在 scheduled_jobs 上
--
-- 038 的 `scheduled_jobs.recurring_interval_ms` 是**毫秒间隔**，对会计周期不适用：
-- 每月天数不同，30 天间隔跑一年会漂移 5 天，最终把 12 月的凭证生成到 11 月。
-- 会计的"每月"是期间概念（2026-06 这个格子），不是时长概念。
--
-- 定期凭证也不该被后台自动过账 —— 房租摊销这个月要不要提、金额有没有变，
-- 是人的判断。模板只负责把重复劳动省掉：生成草稿，人审核过账。
--
-- ## 幂等靠凭证 id 而非额外的执行记录表
--
-- 生成的凭证 id 是 `vch-rec-{模板id}-{期间}`，重复生成会撞主键。多一张
-- runs 表就多一处要和凭证表保持一致的状态，而它能回答的问题（这个模板哪些期
-- 生成过）直接查 vouchers 就有。

create table if not exists recurring_vouchers (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,

  -- 目前只支持按月。季度/年度留 check 而不是留注释：将来加的时候，
  -- 忘了改生成逻辑会在写入端就报错，而不是静默按月生成。
  frequency text not null default 'monthly',

  start_period text not null,
  /** 结束期间；null 表示无限期，如长期租赁。 */
  end_period text,

  voucher_type text not null default 'general',
  /** 摘要模板，`{period}` 会被替换成实际期间。 */
  summary_template text not null,

  status text not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recurring_vouchers_frequency check (frequency in ('monthly')),
  constraint recurring_vouchers_status check (status in ('active', 'paused')),
  constraint recurring_vouchers_start_shape check (start_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint recurring_vouchers_end_shape check (
    end_period is null or end_period ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  -- 结束期间早于开始期间的模板永远不会生成任何东西，却会一直挂在列表里
  -- 让人以为它在工作
  constraint recurring_vouchers_period_order check (
    end_period is null or end_period >= start_period
  )
);

create index if not exists idx_recurring_vouchers_company
  on recurring_vouchers (company_id, status);

create table if not exists recurring_voucher_lines (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  recurring_id text not null references recurring_vouchers(id) on delete cascade,

  summary text not null default '',
  account_code text not null,
  account_name text not null,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  counterparty_id text,
  sort_order int not null default 0,

  -- 与 047 给 ledger_entries / voucher_lines 加的约束同款：金额非负、
  -- 且一条分录只能有一侧。模板里录反了会每个月生成一张错凭证。
  constraint recurring_voucher_lines_amount_nonneg check (debit >= 0 and credit >= 0),
  constraint recurring_voucher_lines_single_side check (debit = 0 or credit = 0)
);

create index if not exists idx_recurring_voucher_lines_recurring
  on recurring_voucher_lines (recurring_id, sort_order);

do $$
declare
  t text;
  rec_tables text[] := array['recurring_vouchers', 'recurring_voucher_lines'];
begin
  foreach t in array rec_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I for all using (company_id = current_setting(''app.current_company'', true)) with check (company_id = current_setting(''app.current_company'', true))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;
