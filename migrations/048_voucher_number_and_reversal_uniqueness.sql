-- V12-A6 + A8：凭证号持久化，红冲唯一性下沉到数据库。
--
-- ## A6 凭证号
--
-- vouchers 表此前没有任何编号列。主键是拼接字符串且各路径规则不同
-- （`tpl-voucher-${Date.now()}`、`vch-rev-${...}-${Date.now()}`、
-- `vch-close-${companyId}-${periodLabel}`）。唯一「像凭证号」的东西在打印 PDF 时
-- 临时算出来且不落库：`V-${日期}-${id 后 6 位大写}`。
--
-- 《会计基础工作规范》第五十一条要求记账凭证连续编号。现在这套编号不连续、
-- 不可预测、不按月起编，系统无法回答「6 月共有多少张凭证」「记-2026-06-0037
-- 在哪里」这类账证核对、审计抽凭、税务稽查的基本问题。
--
-- 设计：凭证字（记/收/付/转）+ 期间（YYYY-MM）+ 月内序号，三者构成凭证号。
-- 中式凭证按月重新起编，所以期间进唯一键。
--
-- **只对已过账凭证唯一**：号码在过账那一刻才真正被消耗，草稿可以没有号。
-- 这一点取自 Odoo 的 account_move —— 它的唯一索引带
-- `WHERE state='posted' AND name != '/'`，避免草稿占用编号导致断号。
--
-- ## A8 红冲唯一性
--
-- 044 建了 idx_vouchers_reverses 普通索引，但 canReverseVoucher 的
-- VOUCHER_ALREADY_REVERSED 检查与实际插入之间没有锁 —— 两个并发请求可以都通过
-- 检查、都插入成功，产生两张红冲凭证把账冲成反方向。
-- 部分唯一索引让数据库兜住这个竞态，比在应用层加锁更省事也更可靠。

-- ── A6：凭证号 ──────────────────────────────────────────────────────
alter table vouchers add column if not exists voucher_word text;
alter table vouchers add column if not exists voucher_seq int;
alter table vouchers add column if not exists period text;

comment on column vouchers.voucher_word is
  '凭证字：记/收/付/转。由 voucher_type 派生，过账时确定。';
comment on column vouchers.voucher_seq is
  '月内序号，按 (company_id, period, voucher_word) 连续编号。仅已过账凭证有值。';
comment on column vouchers.period is
  '会计期间 YYYY-MM，取自 accounting_date。凭证按月重新起编，故它是编号的一部分。';

-- 存量已过账凭证按 (期间, 凭证字) 分组、以过账时间为序补号，保证连续无断号。
-- voucher_type 到凭证字的映射与应用层保持一致：
--   receipt→收  payment→付  accrual/adjustment/general/closing→记
-- 「转」字留给将来的结转专用凭证，此处不产生。
with numbered as (
  select
    id,
    to_char(accounting_date, 'YYYY-MM') as period,
    case voucher_type
      when 'receipt' then '收'
      when 'payment' then '付'
      else '记'
    end as word,
    row_number() over (
      partition by company_id, to_char(accounting_date, 'YYYY-MM'),
        case voucher_type when 'receipt' then '收' when 'payment' then '付' else '记' end
      order by posted_at, created_at, id
    ) as seq
  from vouchers
  where status = 'posted'
)
update vouchers v
set period = n.period, voucher_word = n.word, voucher_seq = n.seq
from numbered n
where n.id = v.id and v.voucher_seq is null;

-- 未过账凭证只需要期间（用于按期间筛选草稿），号码等过账时再分配
update vouchers
set period = to_char(accounting_date, 'YYYY-MM')
where period is null;

-- 号码只对已过账凭证唯一：草稿没有号，不参与占用
create unique index if not exists uq_vouchers_number
  on vouchers (company_id, period, voucher_word, voucher_seq)
  where status = 'posted';

-- 分配下一个号码时按此索引取 max(seq)
create index if not exists idx_vouchers_period_word
  on vouchers (company_id, period, voucher_word);

-- ── A8：红冲唯一性 ──────────────────────────────────────────────────
-- 一张凭证最多只能被红冲一次。canReverseVoucher 的检查与插入之间没有锁，
-- 并发下两个请求可以都通过检查；这条索引让数据库兜住。
create unique index if not exists uq_vouchers_reverses_once
  on vouchers (company_id, reverses_voucher_id)
  where reverses_voucher_id is not null;
