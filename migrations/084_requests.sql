-- V13-B1：申请单（出差 / 采购 / 用款）。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段一」。
--
-- ## 为什么不做成 business_events 的一个 type
--
-- 业务事项是「**已经发生**的经营事实」，申请单是「**尚未发生**的意图」。
-- 可编辑性完全不同：事项过账后不该改，申请单在批准前随时可改、被驳回后还要
-- 改了再提。合成一张表，「这条能不能改」就得靠 type 分支判断，而那种判断
-- 迟早漏一处。
--
-- 关系是**审批通过后派生一条事项**（B2）：意图兑现成事实。`business_event_id`
-- 记住这层派生关系，事项详情页据此显示「来源单据」。
--
-- ## 与预算占用的对应
--
-- approve 时占用、complete 时转实际、cancel/reject 时释放。接线在 store 层，
-- 幂等由 budget_encumbrances 的唯一约束保证（V13-A2 已验证）。

create table if not exists requests (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,

  -- 单据号。人读的编号，与 id 分开：id 是 uuid，报销时口头报 uuid 没人受得了。
  request_no      text not null,

  request_type    text not null check (request_type in ('travel', 'procurement', 'payment', 'other')),
  title           text not null,
  -- 事由。审批人主要看这个决定批不批，所以是必填（空串也算填了，由应用层拦）。
  purpose         text not null default '',

  amount_cents    bigint not null check (amount_cents >= 0),
  currency        text not null default 'CNY',

  -- 费用归属。两者都可空：申请阶段未必知道具体挂哪个科目，
  -- 但填了就能做预算校验——所以界面上要鼓励填，而不是强制。
  cost_center_id  text references cost_centers(id) on delete restrict,
  account_code    text,

  -- 预计发生日。**预算校验按这个日期找期间**，不是按提交日期：
  -- 12 月底申请次年 1 月的差旅，该占次年的预算。
  expected_date   date not null,

  status          text not null default 'draft'
                  check (status in ('draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled')),

  requester_user_id text not null references users(id) on delete restrict,

  -- 审批通过后派生的业务事项。null 表示还没派生（未通过，或通过但派生失败）。
  business_event_id text references business_events(id) on delete set null,

  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_request_no unique (company_id, request_no)
);

create index if not exists idx_requests_requester
  on requests (company_id, requester_user_id, status);

create index if not exists idx_requests_status
  on requests (company_id, status, expected_date);

comment on table requests is
  'V13-B1 申请单。**不是** business_events 的一个 type——事项是已发生的事实、'
  '申请单是尚未发生的意图，可编辑性完全不同。审批通过后派生一条事项。';

comment on column requests.expected_date is
  '预计发生日。预算校验按这个日期找期间，不是按提交日期——12 月底申请次年 1 月的'
  '差旅，该占次年的预算。';

comment on column requests.business_event_id is
  '审批通过后派生的业务事项。null 表示还没派生。事项详情页据此显示「来源单据」。';
