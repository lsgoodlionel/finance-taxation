-- F8 生产激活：创建非属主运行时角色 finance_app 并授予 DML 权限。
--
-- 背景：Postgres 中【表属主】默认绕过 RLS（除非 FORCE）。migrations/039 用 ENABLE
-- （非 FORCE），所以只有当应用以【非属主角色】连接时，核心业务表的租户隔离策略才
-- 真正生效。本脚本创建这样一个角色。
--
-- 以【数据库属主 / 超级用户】连接运行一次（每个环境一次）：
--   psql "$OWNER_DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f scripts/provision-app-role.sql
-- 或用 scripts/provision-app-role.sh（从环境变量读取）。
--
-- 之后：将应用 DATABASE_URL 指向 finance_app，并设 TENANT_RLS_ENABLED=true，
-- 请求级 withTenantRequest 便会为每个请求注入 app.current_company，RLS 强制隔离。
--
-- 安全属性：finance_app 无 SUPERUSER / 无 BYPASSRLS / 非表属主 —— RLS 对其强制生效。

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'finance_app') then
    create role finance_app login;
  end if;
end $$;

alter role finance_app with login password :'app_password'
  nosuperuser nocreatedb nocreaterole nobypassrls;

grant usage on schema public to finance_app;
grant select, insert, update, delete on all tables in schema public to finance_app;
grant usage, select on all sequences in schema public to finance_app;

-- 未来由属主新建的表/序列自动授予（本语句须由表属主执行）。
alter default privileges in schema public
  grant select, insert, update, delete on tables to finance_app;
alter default privileges in schema public
  grant usage, select on sequences to finance_app;
