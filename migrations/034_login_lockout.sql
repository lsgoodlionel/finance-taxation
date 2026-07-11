-- A4 安全加固：登录失败锁定
-- 为 user_passwords 增加失败计数与锁定截止时间，支撑登录暴力破解防护。
-- 历史明文口令（password_hash 存原文）由登录成功时的惰性升级改写为 scrypt 哈希。
alter table user_passwords add column if not exists failed_attempts integer not null default 0;
alter table user_passwords add column if not exists locked_until timestamptz;
