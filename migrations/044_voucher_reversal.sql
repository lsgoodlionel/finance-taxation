-- 红冲（反向凭证）：给已过账凭证提供唯一合法的更正出口。
--
-- 背景：`POST /api/events/:id/analyze` 重新分析时曾无条件删除该事项的派生物，
-- 包括**已过账凭证与其总账分录**（实测 ledger_entries 从 1 变 0，且全程无留痕）。
-- 该路径已被闸门堵死（409 EVENT_HAS_POSTED_VOUCHERS），但堵死之后系统没有任何
-- 更正入口 —— 已过账事项就此进入死路，比原来的"删掉"更让人无从下手。
--
-- 会计上，已入账凭证不得删除或原地改写，只能另做一张反向凭证冲销。本迁移补上
-- 反向凭证与原凭证之间的关系。
--
-- 设计取舍：只存**单向**引用（红冲凭证 → 原凭证）。双向字段（原凭证再存一个
-- reversed_by）需要两处同时写、同时改，任何一处漏掉就出现"A 说被 B 冲了、B 不
-- 认账"的不一致；单向 + 反查索引没有这个风险，代价只是查"这张有没有被冲销"要
-- 走一次索引扫描，量级完全可接受。

alter table vouchers add column if not exists reverses_voucher_id text;

comment on column vouchers.reverses_voucher_id is
  '本凭证冲销的原凭证 id；非空即表示这是一张红冲凭证。NULL 表示普通凭证。';

-- 反查「这张凭证有没有被冲销过」，也用于阻止对同一张凭证重复红冲。
create index if not exists idx_vouchers_reverses
  on vouchers (company_id, reverses_voucher_id)
  where reverses_voucher_id is not null;

-- 外键放在同表内，company_id 的租户隔离由应用层查询保证（与本表既有的
-- business_event_id / mapping_id 一致，不额外引入跨表约束）。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vouchers_reverses_voucher_id_fkey'
  ) then
    alter table vouchers
      add constraint vouchers_reverses_voucher_id_fkey
      foreign key (reverses_voucher_id) references vouchers (id);
  end if;
end $$;
