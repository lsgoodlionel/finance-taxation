-- V13-A4：审批流定义与实例。
--
-- 方案见 docs/v13-expense-control-blueprint-and-plan.md 第二节「阶段三」。
--
-- ## 范围刻意收窄
--
-- 串行多级 + 按金额分级 + 驳回到发起人 + 抄送。**不做**会签/或签、动态加签、
-- 驳回到任意中间节点、流程图可视化编辑。全功能 BPM 是个无底洞，而这几样
-- 覆盖中小企业 90% 的场景。
--
-- 表结构本身也按这个范围设计：`current_step_order` 是一个数字而不是集合——
-- 会签会让它变成集合，届时引擎里每个函数都要改。这是有意的约束，不是疏漏。
--
-- ## 与 workflow.* 权限键的关系
--
-- 权限目录里早就有 `workflow.view` / `workflow.manage`，但此前没有任何菜单项
-- 或路由使用它们——那是历史上给审批流预留的位置。本迁移落地的能力正是用它。

create table if not exists approval_flows (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  name          text not null,

  -- 适用的单据类型。单据表要等批次 B 才建，所以这里只存类型串、不加外键。
  document_type text not null check (document_type in (
    'request',        -- 申请单（出差/采购/用款）
    'advance',        -- 借款/备用金
    'reimbursement',  -- 报销单
    'payment',        -- 付款单
    'contract'        -- 合同（已存在的表，可先接上）
  )),

  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 一种单据类型同时只能有一条启用的流程。
  --
  -- **不做「多条流程按条件选一条」**：那需要在流程之上再来一层路由规则，
  -- 而条件路由已经在步骤的金额门槛里表达了。一种单据一条流程，规则全在
  -- 步骤上——这样「这单会怎么走」只需要看一个地方。
  constraint uq_approval_flow_active_per_type
    exclude (company_id with =, document_type with =) where (is_active)
);

create table if not exists approval_flow_steps (
  id              text primary key,
  flow_id         text not null references approval_flows(id) on delete cascade,

  -- 步骤序号。**允许不连续**：金额分级会跳过中间步骤，引擎按 required 列表
  -- 找下一步而不是 +1（engine.ts 的「推进时跳到下一个 required 步骤」用例）。
  step_order      integer not null check (step_order > 0),

  approver_type   text not null check (approver_type in ('role', 'user', 'manager')),
  -- role 时是角色码，user 时是用户 id，manager（发起人直属上级）时留空。
  approver_value  text,

  -- 触发本步骤的最小金额（分）。**达到即触发**（>=）：制度写「1 万以上需
  -- 财务审批」，1 万整就该走财务。默认 0 表示不限额、总是要走。
  min_amount_cents bigint not null default 0 check (min_amount_cents >= 0),

  created_at      timestamptz not null default now(),

  constraint uq_approval_flow_step_order unique (flow_id, step_order),
  -- manager 类型不需要 approver_value，其余两种必须有——少了这个约束，
  -- 一条 approver_value 为空的 role 步骤会让任何人都批不了，单据永久卡死。
  constraint approval_step_value_required check (
    approver_type = 'manager' or (approver_value is not null and approver_value <> '')
  )
);

create table if not exists approval_instances (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  flow_id         text not null references approval_flows(id) on delete restrict,

  document_type   text not null,
  -- 单据 id。与 budget_encumbrances.source_id 同理：单据表在批次 B 才建，
  -- 不加外键，有效性由应用层保证。
  document_id     text not null,

  submitter_user_id text not null references users(id) on delete restrict,

  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- 当前待办步骤；已结束时为 null。**结束时必须置空**——留着上一步的号会让
  -- 待办查询把已完结的单子捞出来。下面的 CHECK 把这条规则钉死在库上，
  -- 而不是只靠引擎记得。
  current_step_order integer,

  -- 提交时按金额算定并固定下来的步骤序号。存下来而不是每次重算：
  -- 单据金额在驳回后可能被改，重算会让已批过的步骤凭空消失。
  required_step_orders integer[] not null,

  amount_cents    bigint not null check (amount_cents >= 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint approval_instance_step_matches_status check (
    (status = 'pending' and current_step_order is not null)
    or (status <> 'pending' and current_step_order is null)
  ),

  -- 一张单据同时只能有一个进行中的审批实例。驳回后重新提交会产生第二条
  -- 记录（保留历史），但不能有两条同时 pending——那会让单据出现在两个人
  -- 的待办里，各批各的。
  constraint uq_approval_instance_pending
    exclude (company_id with =, document_type with =, document_id with =) where (status = 'pending')
);

create index if not exists idx_approval_instances_pending
  on approval_instances (company_id, status, current_step_order)
  where status = 'pending';

create table if not exists approval_actions (
  id             text primary key,
  instance_id    text not null references approval_instances(id) on delete cascade,
  step_order     integer not null,
  actor_user_id  text not null references users(id) on delete restrict,
  action         text not null check (action in ('approve', 'reject', 'cancel')),
  comment        text,
  acted_at       timestamptz not null default now(),

  -- 同一步骤同一人只能动作一次。重试与连点靠这个约束挡住，而不是靠前端
  -- 禁用按钮——那在网络重试面前没有意义。
  constraint uq_approval_action_once unique (instance_id, step_order, actor_user_id)
);

create index if not exists idx_approval_actions_instance
  on approval_actions (instance_id, acted_at);

-- 抄送。单独成表而不是在 instances 上放数组：抄送人要能各自标记已读，
-- 数组做不到「谁读过了」。
create table if not exists approval_watchers (
  id           text primary key,
  instance_id  text not null references approval_instances(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint uq_approval_watcher unique (instance_id, user_id)
);

comment on table approval_flows is
  'V13-A4 审批流定义。一种单据类型同时只有一条启用流程（排他约束），'
  '条件路由全部表达在步骤的金额门槛上——这样「这单会怎么走」只需要看一个地方。';

comment on column approval_instances.required_step_orders is
  '提交时按金额算定并固定的步骤序号。不每次重算：单据金额在驳回后可能被改，'
  '重算会让已批过的步骤凭空消失或多出没人批过的步骤。金额变了就重新提交。';

comment on constraint approval_instance_step_matches_status on approval_instances is
  '已结束的实例必须把 current_step_order 置空。留着上一步的号会让待办查询'
  '把已完结的单子捞出来——这条规则钉在库上，不只靠引擎记得。';
