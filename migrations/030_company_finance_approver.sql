-- 修复：companies 缺 finance_approver_role 列，导致公司信息查询报错（页面卡加载中）
alter table companies add column if not exists finance_approver_role text not null default 'role-chairman';
