-- 记录凭证的审核人，让「复核人 ≠ 过账人」的职责分离校验有真实数据可依。
--
-- 背景：postVoucher 做职责分离校验时，把 reviewerUserId 与 posterUserId **都**
-- 传成当前登录用户（vouchers/routes.ts），而 workflows/authorization.ts 的规则是
-- 「两者相同即冲突」—— 于是 POST /api/vouchers/:id/post 对任何调用、任何参数
-- 组合都恒返回 400 WORKFLOW_DUTY_CONFLICT，过账功能实际完全不可用。
-- 实测（审核后再过账）：
--   {"error":"reviewer and poster must be different users","code":"WORKFLOW_DUTY_CONFLICT"}
--
-- 根因是 vouchers 表压根没存审核人（只有 approved_at），代码无从取真实复核人，
-- 才退化成「拿当前用户填两个角色」。本迁移补上该列。
--
-- 兼容性：可空。历史上已审核的凭证没有审核人记录，approved_by_user_id 为 NULL；
-- 过账校验对这类历史数据放行职责分离检查（否则存量凭证将永远无法过账），
-- 但会照常要求终审人且照常写审计。新审核的凭证一律记录审核人。

alter table vouchers add column if not exists approved_by_user_id text;

comment on column vouchers.approved_by_user_id is
  '审核人 user id；用于过账时校验复核人与过账人非同一人。NULL 表示 043 迁移之前的历史数据。';
