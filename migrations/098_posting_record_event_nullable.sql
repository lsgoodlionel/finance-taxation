-- 过账记录的业务事项改为可空（V16 角色实验发现）
--
-- ## 问题
--
-- `voucher_posting_records.business_event_id` 是 not null，而**很多凭证天生没有事项**：
-- 折旧、报销付款、备用金打款、银行付款——它们由系统按周期或按单据生成，
-- 不挂在某一条经营事项上。
--
-- 结果是这些凭证一过账就 500：
--   null value in column "business_event_id" ... violates not-null constraint
--
-- 影响面是整条费控链路：钱付了、单据批了，账**永远进不了总账**。
-- 实验时全库 36 张凭证里有 8 张属于此类，已过账的是 0 张。
-- 月结第 4 步「计提折旧」也因此永久卡住——它的判据要求存在已过账的折旧凭证。
--
-- ## 为什么是放开约束而不是回填一个假事项
--
-- 回填凭证自身 id 或造一条占位事项，都是往审计链里塞不存在的东西。
-- 「这张凭证没有对应的经营事项」是**事实**，如实存 null 才对——
-- 与本项目一贯的口径一致：null 与 0、null 与占位值语义不同。
--
-- 分析路径生成的凭证仍然带事项，该有的关联一条都不会少。

-- ## 两张表，不是一张
--
-- 过账写两处：`voucher_posting_records`（谁在什么时候过的账）与
-- `ledger_posting_batches`（这次过账产生了哪批分录）。两张表都有这个约束，
-- 只放开第一张，过账会在第二张上再挂一次——报告里两个角色都只撞到了第一层，
-- 是写测试跑到第二层才暴露出来的。
--
-- 其余带 business_event_id not null 的表（event_document_mappings、tax_items、
-- generated_documents 等）**保持原样**：它们本来就是事项的派生物，
-- 没有事项就不该存在这些行。放开它们才是错的。

alter table voucher_posting_records alter column business_event_id drop not null;
alter table ledger_posting_batches  alter column business_event_id drop not null;

comment on column voucher_posting_records.business_event_id is
  '这次过账对应的经营事项。可空——折旧/报销付款/备用金/银行付款等凭证不挂事项，此时如实存 null。';
comment on column ledger_posting_batches.business_event_id is
  '这批分录对应的经营事项。可空，理由同 voucher_posting_records。';
