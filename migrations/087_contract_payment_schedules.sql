-- V13-C1/C2：合同付款计划与质保金。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段四」。
--
-- ## 合同此前只有基本信息
--
-- `contracts` 表有编号、对方、金额、起止、状态，**没有付款计划、没有质保金、
-- 没有累计已付**。于是「这份合同下个月该付多少」这个出纳每天都要回答的问题，
-- 系统答不上来。
--
-- ## 质保金是独立一期，不是合同上的字段
--
-- 质保金的实质是「合同总额的一部分延后支付」。做成字段会让合同要么永远
-- 显示未付清（质保金一直没付），要么在质保金还没付时就显示已付清。
-- 做成独立一期后，「主体款项已付清、质保金待释放」成为一个能准确表达的状态。
--
-- ## 累计已付不存在这张表上
--
-- 由付款单实时汇总。与报销合计、借款余额同一原则：存冗余汇总列必然漂移，
-- 而漂移时没人知道该信哪个。

create table if not exists contract_payment_schedules (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  contract_id     text not null references contracts(id) on delete cascade,

  -- 期次序号，决定展示顺序。
  period_no       integer not null check (period_no > 0),
  -- 期次名称：首付款 / 进度款 / 尾款 / 质保金。自由文本而不是枚举——
  -- 合同条款的叫法千差万别（「预付款」「动员费」「里程碑款」），
  -- 枚举化只会逼用户在「其他」里写真名。
  title           text not null,

  due_date        date not null,
  amount_cents    bigint not null check (amount_cents >= 0),

  -- 占合同总额的比例（基点）。**可空**：很多合同直接写金额不写比例，
  -- 强制填会让录入变成算术题。填了则用于校验各期之和是否等于合同额。
  ratio_bp        integer check (ratio_bp is null or (ratio_bp > 0 and ratio_bp <= 10000)),

  schedule_type   text not null default 'normal'
                  check (schedule_type in ('normal', 'retention')),

  -- 质保金到期日。**没设则不可释放**（payment-schedule.ts 的判定）：
  -- 没设说明合同条款还没录全，默认可释放会让钱提前付出去。
  retention_release_date date,

  -- 作废标记。**不做成 status 字段**：期次的付款状态由已付金额推导，
  -- 只有「作废」是人工决定、推导不出来的，所以单独一个布尔。
  is_cancelled    boolean not null default false,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_contract_schedule_period unique (contract_id, period_no),

  -- 只有质保金期次能设到期日。普通期次设了它没有任何效果，
  -- 而「设了却不生效」比「不让设」更难查。
  constraint schedule_retention_date_only_for_retention check (
    schedule_type = 'retention' or retention_release_date is null
  )
);

create index if not exists idx_contract_schedules_contract
  on contract_payment_schedules (contract_id, period_no);

-- 「本月应付」查询（C7 出纳视角）：按到期日扫全公司未作废的期次。
create index if not exists idx_contract_schedules_due
  on contract_payment_schedules (company_id, due_date)
  where not is_cancelled;

comment on table contract_payment_schedules is
  'V13-C1 合同付款计划。**累计已付不存在这张表上**——由付款单实时汇总。'
  '期次状态（待付/部分/已付/逾期）同样由已付金额推导，只有「作废」是人工决定。';

comment on column contract_payment_schedules.schedule_type is
  'retention = 质保金，作为独立一期而不是合同上的字段——否则合同要么永远显示'
  '未付清，要么在质保金还没付时就显示已付清，两种都不对。';

comment on column contract_payment_schedules.title is
  '期次名称自由文本，不枚举。合同条款的叫法千差万别（预付款/动员费/里程碑款），'
  '枚举化只会逼用户在「其他」里写真名。';
