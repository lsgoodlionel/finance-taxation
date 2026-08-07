-- V12-B6：给总账取数的「按公司 + 会计日期区间」访问路径补索引。
--
-- ## 为什么现在才需要
--
-- 在此之前，报表取数层压根没有日期条件：利润表、现金流量表、资产负债表、驾驶舱
-- 都是 `select ... from ledger_entries where company_id = $1` 拉回**全部历史分录**，
-- 再在 Node 里 `.filter()` 按日期筛。既然 SQL 里没有 entry_date 谓词，加索引也用不上。
--
-- B6 把区间下推到了 SQL（listCompanyLedgerEntries 的 dateFrom/dateTo，以及试算平衡表
-- 的 `filter (where entry_date ...)`），这两条访问路径才真正成立：
--
--   1. `where company_id = ? and entry_date between ? and ?`     → idx_ledger_company_date
--   2. 试算平衡表：`where company_id = ? and entry_date <= ?` 后按 account_code 分组聚合
--                                                                → idx_ledger_company_account_date
--
-- ## 与既有索引的关系
--
-- 001 建了 `idx_ledger_account (company_id, account_code)`。它能支撑第 2 条的分组，
-- 但日期谓词只能在堆上回表逐行判定。把 entry_date 追加为第三列之后，区间过滤与
-- 分组可以在同一个索引里完成。既有索引不删——`where company_id = ? and account_code = ?`
-- 这类无日期条件的查询（明细账、现金日记账）用窄索引更省。
--
-- 两个索引都是纯读优化，不改变任何数据与约束语义。

create index if not exists idx_ledger_company_date
  on ledger_entries (company_id, entry_date);

create index if not exists idx_ledger_company_account_date
  on ledger_entries (company_id, account_code, entry_date);

comment on index idx_ledger_company_date is
  'V12-B6：支撑报表取数的会计日期区间下推（listCompanyLedgerEntries 的 dateFrom/dateTo）。';
comment on index idx_ledger_company_account_date is
  'V12-B6：支撑试算平衡表「按科目聚合 + 期初/本期/期末三段日期切分」的单次扫描。';
