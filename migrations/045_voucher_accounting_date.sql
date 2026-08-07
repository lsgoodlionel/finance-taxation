-- 会计日期：把「这笔账记在哪个期间」与「什么时候点的过账按钮」分开。
--
-- ## 问题
--
-- postVoucher 此前用过账那一刻的系统时间当分录日期：
--   const postedAt = new Date().toISOString();
--   const voucherPeriod = postedAt.slice(0, 7);   // 期间锁判定用「当前月」
--   entryDate: postedAt.slice(0, 10);             // 分录日期 = 点击过账那天
--
-- 三个后果都是真错账：
-- 1. 6 月的业务 7 月过账 → 分录落在 7 月总账，利润表与资产负债表全部错期。
--    而 business_events.occurred_on（真实业务发生日）一直就在库里，从未被使用。
-- 2. 期间锁形同虚设：锁了 6 月，仍可在 7 月过账一张 6 月的凭证，因为判定用的是
--    当前月而不是这笔账所属的期间。
-- 3. 凭证重新过账时会先删旧分录再插新的，entry_date 随之跳到新的过账日，
--    历史账被静默改期。
--
-- 讽刺的是红冲路径（reverseVoucher）做对了 —— 它按原凭证分录的实际 entry_date
-- 判定期间，注释还写明「跨月红冲用当前月判定会绕过对原期间的锁」。
-- 同一个 isPeriodLocked() 有三个调用点、两种口径。
--
-- ## 回填口径（关键）
--
-- **已过账凭证一律从它自己的 ledger_entries.entry_date 回填**，而不是从业务发生日
-- 取。因为那些分录已经落在总账里、已经进过报表，改 accounting_date 去对齐业务日
-- 会让历史报表数字发生变化 —— 修复不该改写历史。存量账保持原样，新账走新口径。
--
-- 未过账凭证才从 business_events.occurred_on 取，让它们从此刻起就是对的。

alter table vouchers add column if not exists accounting_date date;

comment on column vouchers.accounting_date is
  '会计日期：这笔账归属的期间，决定 ledger_entries.entry_date 与期间锁判定。与过账操作时间（posted_at）无关。';

-- 1) 已过账凭证：从自己的总账分录取，保证历史账一分不动
update vouchers v
set accounting_date = le.entry_date
from (
  select voucher_id, min(entry_date) as entry_date
  from ledger_entries
  group by voucher_id
) le
where le.voucher_id = v.id and v.accounting_date is null;

-- 2) 其余凭证：优先业务发生日，其次凭证创建日
update vouchers v
set accounting_date = coalesce(
  (select be.occurred_on from business_events be where be.id = v.business_event_id),
  v.created_at::date
)
where v.accounting_date is null;

-- 3) 兜底（理论上不会命中，防御 business_event_id 悬空的历史脏数据）
update vouchers set accounting_date = created_at::date where accounting_date is null;

alter table vouchers alter column accounting_date set not null;

-- 默认值只服务于「不关心会计日期」的插入点（种子数据、测试夹具）。
-- **所有业务创建路径必须显式设置它**：模板创建取业务发生日、事项分析取事项发生日、
-- 期末结转取期末日、红冲取红冲当日。靠默认值就等于退回「会计日期 = 今天」的旧 bug，
-- 所以业务路径的显式赋值由 post-authorization.integration.test.ts 的两条断言钉住。
alter table vouchers alter column accounting_date set default current_date;

-- 按期间查凭证是月结、报表、期间锁的高频路径
create index if not exists idx_vouchers_company_accounting_date
  on vouchers (company_id, accounting_date);
