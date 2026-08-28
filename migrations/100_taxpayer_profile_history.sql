-- 纳税人档案支持沿革（V16 角色实验发现的阻断缺陷）
--
-- ## 问题：写入端与读取端互相矛盾
--
-- 读取端 `resolveActiveTaxpayerProfile` 按「所有 active 里取生效日 ≤ 查询日的
-- 最近一条」——它本来就是按**多档沿革**设计的。
--
-- 写入端却在每次新增时无条件把**所有** active 改成 inactive：
--
--   update taxpayer_profiles set status = 'inactive'
--    where company_id = $1 and status = 'active'
--
-- 于是纳税人身份的历史保存不下来。更糟的是税务专员实测到的那个场景：
-- 录一条 **2030-01-01 生效**的小规模登记，当场把 2026 年那条也改成 inactive，
-- 于是 `GET /api/tax/rules?occurredOn=2026-05-01` 立刻变成
-- 「Active taxpayer profile not found」——**整个税务模块当期瘫痪**，
-- 而用户只是录了一条未来生效的登记。
--
-- ## 做法：照搬税率主数据那一套
--
-- 税率沿革（17%→16%→13%）早就用「生效区间 + 重叠校验」解决了同一个问题。
-- 这里加 `effective_to`，让一家公司可以同时有多条 active、各管一段时间。
--
-- 存量回填：按生效日排序，前一条的失效日 = 后一条生效日的前一天。
-- 被旧逻辑改成 inactive 的历史档**不动**——分不清那是用户主动停用的，
-- 还是被那个 bug 顺手改掉的，猜错方向会凭空改变历史口径。

alter table taxpayer_profiles add column if not exists effective_to date null;

comment on column taxpayer_profiles.effective_to is
  '失效日（含）。null = 仍然有效。与 effective_from 一起构成生效区间，'
  '同一家公司的区间不得重叠——重叠会让「这一天算什么纳税人」有两个答案。';

-- 存量：给每条 active 档案按下一条的生效日封口。
update taxpayer_profiles t
set effective_to = (next_profile.effective_from - interval '1 day')::date
from (
  select
    id,
    company_id,
    effective_from,
    lead(effective_from) over (partition by company_id order by effective_from) as next_from
  from taxpayer_profiles
  where status = 'active'
) ranked
join lateral (select ranked.next_from as effective_from) next_profile on true
where t.id = ranked.id
  and t.effective_to is null
  and ranked.next_from is not null;
