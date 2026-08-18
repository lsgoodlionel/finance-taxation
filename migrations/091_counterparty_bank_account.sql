-- V13 残留 9：往来单位的收款账户。
--
-- ## 为什么导出的账号列是空的
--
-- C6 的银行付款指令导出做完时，收款人账号只能留空——`counterparties` 表里
-- 没有银行账户字段。当时的判断是「宁可留空让出纳补，也不编一个出来」，
-- 因为那个文件直接进银行系统。
--
-- 现在补上字段，导出就能填真值。
--
-- ## 三个字段而不是一个
--
-- 户名单独存：**收款户名未必等于往来单位名称**。供应商可能用关联公司的
-- 账户收款，个人往来更是常见（对方是「张三工作室」而账户户名是「张三」）。
-- 把户名等同于单位名，转账会被银行以「户名不符」退回。

alter table counterparties
  add column if not exists bank_name text,
  add column if not exists bank_account text,
  add column if not exists bank_account_name text;

comment on column counterparties.bank_account_name is
  'V13：收款户名。**单独存而不是复用 name**——供应商可能用关联公司的账户收款，'
  '个人往来更常见（单位名「张三工作室」而户名「张三」）。等同处理会被银行'
  '以户名不符退回。';

comment on column counterparties.bank_account is
  'V13：收款账号。导出银行指令时用。存文本不存数字——16-19 位卡号超出'
  'integer 范围，而且开头可能有 0。';
