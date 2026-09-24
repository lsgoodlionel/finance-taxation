-- 报表快照的溯源回指（V15/P1）
--
-- 此前 report_snapshots 只存 payload，一份快照拿到手回答不了两个问题：
--   1. 是谁、在什么时候生成的？
--   2. 生成之后总账还动过吗？
--
-- 第二个问题是要害。月结后有人补了一张凭证，那份快照就已经和账不一致了，
-- 而用户看不出来——他会拿着一份过期的报表去申报。这几列让「过期」可判定。
--
-- 全部可空：老数据没有溯源信息，这是**事实**，不能用默认值假装它有。
-- 取不到就显示「来源未知」，比显示一个编出来的截止时点安全。

alter table report_snapshots
  add column if not exists generated_by_user_id   text        null references users(id),
  add column if not exists source_entry_count     integer     null,
  add column if not exists source_latest_posted_at timestamptz null,
  add column if not exists period_start           date        null,
  add column if not exists period_end             date        null;

comment on column report_snapshots.source_entry_count is
  '生成时纳入计算的已过账分录条数。与当前条数不一致即说明快照已过期。';
comment on column report_snapshots.source_latest_posted_at is
  '纳入计算的最后一笔分录的过账时间，即这份报表的数据截止时点。';
