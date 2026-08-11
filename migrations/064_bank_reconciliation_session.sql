-- V12-C3：银行存款余额调节表与对账会话。
--
-- ## 现状缺的是「收口」
--
-- 银行对账已经有流水导入（020）、自动匹配候选与人工确认（022）。缺的是最后
-- 也是唯一有会计意义的一步：**余额调节表**。
--
-- 匹配只回答"这笔流水对应哪张凭证"，回答不了"银行说我有 380 万、账上说
-- 有 350 万，这 30 万差在哪"。而后者才是对账的目的 —— 差额若解释不清，
-- 要么是漏记了收付款，要么是被人动了钱。审计必查的也是这张表。
--
-- ## 银行账户与科目此前没有关联
--
-- `bank_accounts` 建表时没有 account_code，于是「这个账户的账面余额是多少」
-- 根本无从算起。补上，默认 1002 银行存款。
--
-- 多个账户共用同一科目时，账面余额只能算到科目层，拆不到账户 —— 这是
-- 科目设置问题（应为每个账户设 100201/100202 之类的明细科目），代码里
-- 如实报告而不是猜一个分摊比例。

alter table bank_accounts add column if not exists account_code text not null default '1002';

comment on column bank_accounts.account_code is
  '该银行账户对应的会计科目。多个账户共用同一科目时，余额调节表只能算到科目层，'
  '拆不到账户——需为每个账户设置独立明细科目。';

-- ## 对账会话
--
-- 一次对账是一个有结论的动作：截止某日、某账户、银行余额多少、账面余额多少、
-- 未达账项有哪些、调节后是否相等。存下来的理由是它要能被复查 —— 三个月后
-- 有人问"6 月末那 30 万差额后来怎么解释的"，得答得出来。
create table if not exists bank_reconciliations (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  bank_account_id text not null references bank_accounts(id) on delete cascade,

  as_of_date date not null,
  /** 银行对账单余额，由用户从对账单上抄入——这是外部事实，系统无从推算。 */
  statement_balance numeric(18,2) not null,
  /** 账面余额，由该账户对应科目的分录算得。 */
  book_balance numeric(18,2) not null,
  /** 调节后余额；两边调节后应当相等，存的是这个共同值。 */
  adjusted_balance numeric(18,2) not null,
  /**
   * 调节后仍未解释的差额。
   *
   * **系统不把它凑平**。差额不为 0 说明还有未达账项没被识别，或者有真实的
   * 错账/资金异常——这正是对账要发现的东西。自动补一笔平衡分录等于把
   * 对账的唯一价值抹掉。与 B5 资产负债表自检、期初建账是同一个设计原则。
   */
  difference numeric(18,2) not null,

  status text not null default 'draft',
  notes text not null default '',
  closed_by text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bank_reconciliations_status check (status in ('draft', 'closed')),
  -- 已封存的必须有封存人与时间；缺一个就说明状态是被绕过流程改的
  constraint bank_reconciliations_closed_consistent check (
    (status = 'closed') = (closed_at is not null)
  )
);

-- 一个账户一个截止日只有一份对账结论。重复对账要么覆盖草稿、要么先撤销封存，
-- 不能并存两份说法不同的调节表。
create unique index if not exists uq_bank_reconciliations_account_date
  on bank_reconciliations (bank_account_id, as_of_date);
create index if not exists idx_bank_reconciliations_company
  on bank_reconciliations (company_id, as_of_date desc);

-- 未达账项明细：封存时把当时的四类未达账项快照下来。
--
-- 不靠事后重算：流水会继续导入、凭证会继续过账，三个月后重算出来的
-- 「6 月末未达账项」和当时看到的不是一回事。对账结论必须连同它的依据一起冻结。
create table if not exists bank_reconciliation_items (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  reconciliation_id text not null references bank_reconciliations(id) on delete cascade,

  /**
   * 四类未达账项，命名严格按会计口径（前者是记账方，后者是未入账方）：
   *   book_only_receipt  企业已收、银行未收（在途存款）
   *   book_only_payment  企业已付、银行未付（未兑付支票）
   *   bank_only_receipt  银行已收、企业未收（如代收利息）
   *   bank_only_payment  银行已付、企业未付（如银行扣费）
   */
  item_type text not null,
  occurred_on date not null,
  amount numeric(18,2) not null,
  description text not null default '',
  /** 来源：银行侧填 bank_statements.id，账面侧填 ledger_entries.id。 */
  source_id text,

  created_at timestamptz not null default now(),

  constraint bank_reconciliation_items_type check (
    item_type in ('book_only_receipt', 'book_only_payment', 'bank_only_receipt', 'bank_only_payment')
  ),
  constraint bank_reconciliation_items_amount_positive check (amount > 0)
);

create index if not exists idx_bank_reconciliation_items_recon
  on bank_reconciliation_items (reconciliation_id, item_type);

do $$
declare
  t text;
  recon_tables text[] := array['bank_reconciliations', 'bank_reconciliation_items'];
begin
  foreach t in array recon_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I for all using (company_id = current_setting(''app.current_company'', true)) with check (company_id = current_setting(''app.current_company'', true))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;
