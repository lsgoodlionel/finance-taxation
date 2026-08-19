-- V14-B：会签 / 或签 / 动态加签。
--
-- ## 推翻 083 的一句话
--
-- 083 的文件头写着：「`current_step_order` 是一个数字而不是集合——会签会让它
-- 变成集合，届时引擎里每个函数都要改。这是有意的约束，不是疏漏。」
--
-- 现在要做会签了，但**那句话的结论不必兑现**：步骤序号仍然是一个数字。
-- 变成集合的不是「当前步骤」，而是「当前步骤有几个人要批」。
--
-- 这个区分是本次改造能不动审批引擎的原因：
--   `applyApprovalAction` 的签名不变，只多一个「本步骤是否已满足推进条件」的
--   入参，默认 true —— 于是 V13 的 27 条审批测试一条都不用改。
--
-- ## 一个步骤多个审批人
--
-- 083 里 `approval_flow_steps` 一行就是一个审批人，`unique(flow_id, step_order)`
-- 让一个步骤只能有一个人。会签需要「财务总监 + 技术负责人 + 总经理都要批」，
-- 所以审批人挪到子表。
--
-- **旧的两列复制进子表后删掉**，不是留着不用：留着就是两个「谁来批」的出处，
-- 迟早有人改了一处没改另一处，而那种错误表现为「配置里明明改了审批人，
-- 实际还是老的人收到待办」。

-- ── 步骤：加模式，审批人挪走 ──────────────────────────────────────────

alter table approval_flow_steps
  add column if not exists mode text not null default 'all'
    check (mode in ('all', 'any'));

comment on column approval_flow_steps.mode is
  'V14-B：all=会签（都要批），any=或签（任一人批即可）。**没有 serial 模式**——'
  '只有一个审批人时 all 与 any 行为完全相同，多一个枚举值就多一条要测的分支。';

create table if not exists approval_flow_step_approvers (
  id             text primary key,
  flow_id        text not null references approval_flows(id) on delete cascade,
  step_order     integer not null check (step_order > 0),

  approver_type  text not null check (approver_type in ('role', 'user', 'manager')),
  -- role 时是角色码，user 时是用户 id，manager（发起人直属上级）时留空。
  approver_value text,

  sort_order     integer not null default 1,
  created_at     timestamptz not null default now(),

  -- 同一步骤不能把同一个人/角色列两遍。列两遍在会签下意味着「他要批两次」，
  -- 而实际上他只会看到一条待办 —— 单据永远推不过去。
  constraint uq_flow_step_approver unique (flow_id, step_order, approver_type, approver_value),

  -- 与 083 同一条约束：manager 不需要 value，其余两种必须有。
  -- 少了它，一条 value 为空的 role 步骤会让任何人都批不了，单据永久卡死。
  constraint flow_step_approver_value_required check (
    approver_type = 'manager' or (approver_value is not null and approver_value <> '')
  )
);

create index if not exists idx_flow_step_approvers_lookup
  on approval_flow_step_approvers (flow_id, step_order, sort_order);

-- 把 083 的审批人搬进来。先复制再删列，同一个迁移里完成——
-- 分两次做就有一个「新表空着、旧列已删」的中间状态。
insert into approval_flow_step_approvers (id, flow_id, step_order, approver_type, approver_value, sort_order)
select 'fsa-' || s.id, s.flow_id, s.step_order, s.approver_type, s.approver_value, 1
  from approval_flow_steps s
 where not exists (
   select 1 from approval_flow_step_approvers a
    where a.flow_id = s.flow_id and a.step_order = s.step_order
 );

alter table approval_flow_steps drop constraint if exists approval_step_value_required;
alter table approval_flow_steps drop column if exists approver_type;
alter table approval_flow_steps drop column if exists approver_value;

-- ── 实例：步骤参与人 ──────────────────────────────────────────────────

-- 一个实例的某个步骤上，具体是哪几个人要批、各自批没批。
--
-- ## 为什么在提交时就把角色解析成人
--
-- 步骤上写的是「财务角色」，而会签要判断的是「这几个人都批了吗」。
-- 如果每次都现查角色成员，中途有人入职离职就会让「都批了」的判断
-- 忽然不成立或忽然成立 —— 一张审批中的单子不该因为人事变动而改变结论。
--
-- 与 `required_step_orders` 在提交时固定下来是同一个道理。
create table if not exists approval_step_participants (
  id            text primary key,
  instance_id   text not null references approval_instances(id) on delete cascade,
  step_order    integer not null check (step_order > 0),
  user_id       text not null references users(id) on delete restrict,

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  acted_at      timestamptz,
  comment       text,

  -- 动态加签标记。留着是为了让「这个人是流程里本来就有的，还是审批中被
  -- 拉进来的」在事后看得出来 —— 那是审计时第一个会被问到的问题。
  is_added      boolean not null default false,
  added_by_user_id text references users(id) on delete restrict,

  created_at    timestamptz not null default now(),

  -- 同一步骤同一人只出现一次。出现两次在会签下意味着他要批两次，
  -- 而他只会看到一条待办，单据永远推不过去。
  constraint uq_step_participant unique (instance_id, step_order, user_id),

  -- 已表态的必须有时间戳。没有时间戳的「已批准」在审计里说不清是什么时候批的。
  constraint step_participant_acted_at_matches check (
    (status = 'pending' and acted_at is null)
    or (status <> 'pending' and acted_at is not null)
  )
);

create index if not exists idx_step_participants_instance
  on approval_step_participants (instance_id, step_order);

-- 待办查询用：某人在哪些实例的哪些步骤上还没表态。
create index if not exists idx_step_participants_pending
  on approval_step_participants (user_id, status)
  where status = 'pending';

comment on table approval_step_participants is
  'V14-B 步骤参与人。**角色在提交时就解析成具体的人**——现查角色成员会让'
  '一张审批中的单子因为人事变动改变结论。与 required_step_orders 在提交时'
  '固定是同一个道理。';

comment on column approval_step_participants.is_added is
  'V14-B 动态加签标记。「这个人是流程里本来就有的，还是审批中被拉进来的」'
  '是审计时第一个会被问到的问题。';
