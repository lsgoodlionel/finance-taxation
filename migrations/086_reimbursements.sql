-- V13-B4/B5/B7：报销单、明细行与费用分摊。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段二」。
--
-- ## 合计金额不存在报销单上
--
-- 与借款余额同理：合计由明细行算出来。存一份冗余合计，迟早出现「单头 1000、
-- 明细合计 980」的状态，而那时没人知道该信哪个、也说不清是哪一行被改过。
--
-- ## 分摊是明细行的属性，不是单头的
--
-- 一张报销单里，住宿费可能全归研发部，而请客吃饭要研发市场对半分。
-- 挂在单头上就表达不了这种差别——而那恰恰是「一单多部门」的常见形态。

create table if not exists reimbursements (
  id                text primary key,
  company_id        text not null references companies(id) on delete cascade,
  reimbursement_no  text not null,

  -- 关联的申请单与借款单，都可空：
  -- - 事前没申请直接报销（小额）在多数公司是允许的
  -- - 没借过款的报销直接付给员工，不需要冲销
  request_id        text references requests(id) on delete set null,
  advance_id        text references advances(id) on delete set null,

  applicant_user_id text not null references users(id) on delete restrict,

  -- 申请人对应的往来单位。冲销借款要用它去核销 1221 上的分录；
  -- 即便没有借款也存着——报销未付款期间挂在其他应付款上，同样按人分户。
  counterparty_id   text not null references counterparties(id) on delete restrict,

  -- 费用发生日。**预算与费用标准都按这个日期判**，不是提交日期：
  -- 跨月报销（月底出差、次月初报销）按发生日归期才是对的。
  expense_date      date not null,

  status            text not null default 'draft'
                    check (status in ('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled')),

  -- 生成的记账凭证。审批通过后生成草稿，会计过账后账上才有这笔费用。
  voucher_id        text references vouchers(id) on delete set null,

  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint uq_reimbursement_no unique (company_id, reimbursement_no)
);

create index if not exists idx_reimbursements_applicant
  on reimbursements (company_id, applicant_user_id, status);

create table if not exists reimbursement_lines (
  id               text primary key,
  company_id       text not null references companies(id) on delete cascade,
  reimbursement_id text not null references reimbursements(id) on delete cascade,

  -- 费用类型，与 expense_standards.expense_type 同一套取值。超标判定按它匹配标准。
  expense_type     text not null,
  -- 费用科目。落账时的借方科目。
  account_code     text not null,

  amount_cents     bigint not null check (amount_cents >= 0),

  -- 数量（住了几晚、请了几次）。**按日限额要乘它**，见 expense-standards/check.ts。
  quantity         integer not null default 1 check (quantity > 0),

  -- 关联的发票（B5：票据中心「转报销单」时带过来）。可空——不是所有费用
  -- 都有发票（比如误餐补助）。
  invoice_id       text references invoices(id) on delete set null,

  summary          text not null default '',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),

  -- **同一张发票不能在同一张报销单里出现两次**。跨单据的重复报销检测是
  -- 批次 D 的事（要扫全公司历史），但同单内重复是纯粹的误操作，
  -- 在这里拦住成本最低。
  constraint uq_reimbursement_line_invoice unique (reimbursement_id, invoice_id)
);

create index if not exists idx_reimbursement_lines_parent
  on reimbursement_lines (reimbursement_id, sort_order);

-- 发票 → 报销行的反查索引。批次 D 的重复报销检测要按发票号扫全公司，
-- 没有这个索引会全表扫描。
create index if not exists idx_reimbursement_lines_invoice
  on reimbursement_lines (company_id, invoice_id)
  where invoice_id is not null;

create table if not exists reimbursement_allocations (
  id             text primary key,
  company_id     text not null references companies(id) on delete cascade,
  line_id        text not null references reimbursement_lines(id) on delete cascade,
  cost_center_id text not null references cost_centers(id) on delete restrict,

  -- 比例（基点，10000 = 100%）与金额都存。
  --
  -- 只存金额的话，报销行从 1000 改成 1200 后没人知道该怎么重新拆；
  -- 只存比例的话，末项扫尾的那一分会在每次读取时重算，而重算结果可能
  -- 与当初写进凭证的不一致。
  ratio_bp       integer not null check (ratio_bp > 0 and ratio_bp <= 10000),
  amount_cents   bigint not null check (amount_cents >= 0),

  created_at     timestamptz not null default now(),

  -- 同一行费用里，一个部门只能出现一次。重复会让报表上看到它被分了两次。
  constraint uq_reimbursement_allocation unique (line_id, cost_center_id)
);

create index if not exists idx_reimbursement_allocations_line
  on reimbursement_allocations (line_id);

comment on table reimbursements is
  'V13-B4 报销单。**合计金额不存在这张表上**——由明细行算出来。存一份冗余合计'
  '迟早出现「单头 1000、明细合计 980」，而那时没人知道该信哪个。';

comment on column reimbursements.expense_date is
  '费用发生日。预算与费用标准都按这个日期判，不是提交日期——跨月报销'
  '（月底出差、次月初报销）按发生日归期才是对的。';

comment on table reimbursement_allocations is
  'V13-B7 费用分摊。挂在**明细行**而不是单头：一张单里住宿费可能全归研发部，'
  '而请客吃饭要研发市场对半分，挂单头表达不了这种差别。'
  '比例与金额都存，理由见 ratio_bp 列的设计说明。';
