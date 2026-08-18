-- V13 残留 7：验收单，补齐「三单匹配」的第三单。
--
-- ## 此前只有两单
--
-- D 批次做「三单匹配」时，FT 没有验收单据，实现的是报销行与发票的金额
-- 一致性（两单）。合同侧靠付款计划的超付拦截兜着。
--
-- 现在补上验收，「合同期次 × 验收 × 发票」三方才真的能比。
--
-- ## 关联合同，期次可空
--
-- 有的合同一次性验收（设备到货签收），有的按期验收（工程进度款）。
-- 强制关联期次会让前者填不进来，强制只关联合同又表达不了后者。
-- 所以 `contract_id` 必填、`schedule_id` 可空。
--
-- ## 验收金额而不是数量
--
-- 标的物千差万别（台、吨、人月、批次），存数量就要存单位，存单位就要
-- 处理换算。而三单匹配比的是**钱**——验收数量最终要折成金额才能与合同
-- 期次和发票比。数量与规格描述用一个自由文本字段记，够用且不必维护单位表。

create table if not exists acceptances (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  acceptance_no   text not null,

  contract_id     text not null references contracts(id) on delete cascade,
  -- 可空：一次性验收的合同不填期次。
  schedule_id     text references contract_payment_schedules(id) on delete set null,

  accepted_on     date not null,
  -- 本次验收确认的价值（分）。三单匹配比的是钱，不是数量。
  amount_cents    bigint not null check (amount_cents >= 0),

  -- 数量与规格的自由描述（「服务器 10 台，型号 R740」）。
  -- 不建结构化的数量+单位：标的物千差万别，存单位就要处理换算，
  -- 而换算错了比不写更糟。
  quantity_note   text not null default '',

  status          text not null default 'draft'
                  check (status in ('draft', 'confirmed', 'cancelled')),

  -- 验收人。**不是发起人**——验收的意义就在于「另一个人确认东西真的到了」。
  accepted_by_user_id text not null references users(id) on delete restrict,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_acceptance_no unique (company_id, acceptance_no)
);

-- 按合同/期次汇总已验收金额（三单匹配要用）。与「不存冗余汇总」一致——
-- 累计已验收由这张表算，不在合同或期次上存字段。
create index if not exists idx_acceptances_contract
  on acceptances (contract_id, status);

create index if not exists idx_acceptances_schedule
  on acceptances (schedule_id) where schedule_id is not null;

comment on table acceptances is
  'V13 残留 7 验收单，「三单匹配」的第三单。**累计已验收不存在合同或期次上**——'
  '由本表按 status = confirmed 汇总，与报销合计、借款余额同一原则。';

comment on column acceptances.amount_cents is
  '本次验收确认的价值。存金额而不是数量：标的物千差万别（台/吨/人月/批次），'
  '存数量就要存单位、就要处理换算，而三单匹配比的本来就是钱。';

comment on column acceptances.accepted_by_user_id is
  '验收人。验收的意义就在于「另一个人确认东西真的到了」——'
  '谁验收要留痕，出问题时找得到人。';
