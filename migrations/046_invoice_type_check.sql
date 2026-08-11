-- 发票类型统一取值并加约束 —— 支撑「进项是否可抵扣」的判定。
--
-- ## 背景
--
-- invoices.invoice_type 此前是自由文本（schema 层只限 max:50），且实际存在两种
-- 拼法：020 的列注释与前端下拉都用 `vat_general`，而 025 的演示数据写了
-- `vat_common`。同时 buildInvoiceVoucherDraft 只 switch 了 direction，
-- **进项一律挂 222102 应交税费-应交增值税（进项）** —— 普通发票不可抵扣却被当
-- 专用发票做了进项抵扣，直接导致增值税申报少缴税。
--
-- `vat_common` 按笔误处理迁移成 `vat_general`，不纳入合法取值：三处来源里只有
-- 一行演示数据这么写，纳入等于把笔误固化进契约，之后每个读发票类型的地方都要
-- 记得判两个值。
--
-- ## 顺序不可颠倒
--
-- 必须先 UPDATE 归一存量数据，再加 CHECK。反过来会因存量 `vat_common` 直接失败。

update invoices set invoice_type = 'vat_general' where invoice_type = 'vat_common';

-- `other` 必须在允许集合里：前端下拉 INV_TYPE_LABELS 提供了该选项，
-- 漏掉会让正常录入直接 500。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_invoice_type_check'
  ) then
    alter table invoices
      add constraint invoices_invoice_type_check
      check (invoice_type in ('vat_special', 'vat_general', 'electronic', 'receipt', 'other'));
  end if;
end $$;

comment on column invoices.invoice_type is
  '发票类型。可抵扣性判定见 modules/invoices/invoice-types.ts：仅 vat_special 允许进项抵扣；'
  'electronic 只说明载体是电子的（全电发票下电子专票/电子普票都存在），单凭它无法判定，'
  '故按不可抵扣处理 —— 错误方向刻意偏向多缴税（看得见、可纠正）而非少缴税（税务违规）。';
