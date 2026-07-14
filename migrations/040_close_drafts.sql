-- H1-w2 草稿队列接线：给 event_voucher_drafts 幂等加列，支撑 draft-then-approve 工作流。
-- AI（generate）只产草稿；approve 只把草稿升级为「草稿状态」的正式凭证，绝不过账——
-- 真正入账仍必须经由既有的 POST /api/vouchers/:id/post（借贷平衡 + 期间锁双重校验）。
--
-- status 语义复用既有列，不新增列：draft（待决）| approved（已批准，已生成草稿凭证）|
-- rejected（已驳回）。

alter table event_voucher_drafts
  add column if not exists proposal_level      text,                          -- auto|suggest|manual（见 close/draft-proposal.ts 的 AutomationLevel）
  add column if not exists balanced             boolean,                       -- 生成时的借贷平衡快照（approve 时会重新硬校验，不信任此列）
  add column if not exists rationale            text,                         -- 会计建议的判断依据（人类可读）
  add column if not exists source               text not null default 'ai_close',
  add column if not exists generated_run_id     text,                         -- 归属的一次 /close/drafts/generate 批次
  add column if not exists approved_voucher_id  text references vouchers(id), -- approve 后回填，指向新生成的草稿凭证
  add column if not exists decided_at           timestamptz;                  -- approve/reject 的落定时间

create index if not exists idx_voucher_drafts_status on event_voucher_drafts(company_id, status);
create index if not exists idx_voucher_drafts_run on event_voucher_drafts(generated_run_id) where generated_run_id is not null;
