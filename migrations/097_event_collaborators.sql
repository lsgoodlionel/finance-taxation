-- 经营事项的显式协作人（V15/P1：数据级权限收敛）
--
-- 收敛前的可见性口径是「自己名下的，或**同部门的全部**」。
-- 部门口径有两个问题：
--   1. 范围过宽——财务部任何人能看到财务部每一条事项，包括薪酬、裁员补偿这类
--      本该只有经办人和指定的人看得到的；
--   2. 靠部门**名称字符串**比对，改个部门名可见性就悄悄变了。
--
-- 收敛后：owner + 显式协作人 + 公司级权限（董事长 / 财务总监）。
--
-- ## 存量怎么办
--
-- 直接砍掉部门口径，会让所有人明天早上突然看不到同事的事项——那是把一次
-- 权限收敛做成一次事故。这里把**当前**的部门可见关系一次性显式化：迁移执行
-- 那一刻能看到某条事项的部门同事，落成该事项的协作人。
--
-- 于是存量可见性不变，而**机制变了**：从今往后新建的事项不再自动扩散给整个
-- 部门，要谁看得见就得把谁加进来。这是一次性的历史包袱固化，不是新口径的一部分。

create table if not exists event_collaborators (
  business_event_id text        not null references business_events(id) on delete cascade,
  user_id           text        not null references users(id) on delete cascade,
  added_by_user_id  text        null     references users(id),
  -- 'migrated' = 迁移时从部门口径固化而来；'manual' = 有人显式加的。
  -- 分开记是为了将来能回答「这条可见性到底是谁给的」——如果全都写成 manual，
  -- 那就等于伪造了一条不存在的授权记录。
  source            text        not null default 'manual',
  created_at        timestamptz not null default now(),
  primary key (business_event_id, user_id)
);

create index if not exists idx_event_collaborators_user on event_collaborators(user_id);

-- 存量固化：把当前「同部门可见」的关系落成协作人。
-- 排除 owner 本人（owner 的可见性不靠这张表）。
insert into event_collaborators (business_event_id, user_id, added_by_user_id, source)
select e.id, u.id, null, 'migrated'
from business_events e
join users u
  on u.company_id = e.company_id
 and u.status = 'active'
join departments d
  on d.id = u.department_id
 and d.name = e.department
where e.owner_id is distinct from u.id
on conflict do nothing;
