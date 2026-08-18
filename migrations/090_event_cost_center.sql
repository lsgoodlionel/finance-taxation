-- V13 残留 6：把成本中心从申请单一路传到凭证。
--
-- ## 断点在哪
--
-- V12-D1 给 `voucher_lines` 与 `ledger_entries` 加了 `cost_center_id`，
-- 录凭证时能选部门。但从申请单派生的那条链路是断的：
--
-- ```
-- requests.cost_center_id  ✓
--   → business_events      ✗ 没有这一列
--     → voucher_draft_lines ✗ 没有这一列
--       → voucher_lines    ✓ 有，但上游没值可带
-- ```
--
-- 于是做账的人要重新选一次部门，而他未必知道申请人当初填的是哪个。
-- 填错了不会报错——那笔费用只是悄悄归到了另一个部门头上。
--
-- ## 只补自动链路，不改手工录入
--
-- 手工建的事项本来就在录凭证时选部门（现有流程没问题）。断点只发生在
-- 「申请单派生的事项」上，所以这里补的是**承载字段**，让已有的值能流下去。
--
-- 事项上的成本中心是**建议值**：录凭证时仍可改。它回答的是「申请人当初说
-- 这笔算哪个部门的」，而不是「这笔最终归谁」——后者以凭证上的为准。

alter table business_events
  add column if not exists cost_center_id text references cost_centers(id) on delete set null;

comment on column business_events.cost_center_id is
  'V13 残留 6：费用归属部门，从申请单派生时带过来。**是建议值**——录凭证时仍可改，'
  '最终以凭证行上的为准。它回答「申请人当初说这笔算哪个部门的」。';

create index if not exists idx_business_events_cost_center
  on business_events (company_id, cost_center_id)
  where cost_center_id is not null;

alter table voucher_draft_lines
  add column if not exists cost_center_id text references cost_centers(id) on delete set null;

comment on column voucher_draft_lines.cost_center_id is
  'V13 残留 6：草稿行的成本中心。草稿转正式凭证时带到 voucher_lines——'
  '没有这一列，事项上的部门信息在生成草稿那一步就丢了。';
