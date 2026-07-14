-- F8 多租户 RLS：在核心业务表上启用行级安全 + 租户隔离策略。
--
-- 策略：company_id 必须等于会话变量 app.current_company（由请求级
-- withTenantRequest 在事务内 set_config 注入）。current_setting(..., true) 的
-- missing_ok=true 使无上下文时返回 NULL → 比较为 NULL（非真）→ fails-closed
-- （读不到任何行、写入被拒），符合安全默认。
--
-- 只用 ENABLE 不用 FORCE：表属主（迁移/种子/数据回填以 owner 运行）绕过 RLS，
-- 因此 015 等种子迁移不受影响；真正的隔离在应用以【非属主 app 角色】
-- （finance_app，DATABASE_URL 指向它 + TENANT_RLS_ENABLED=true）连接时生效。
-- 生产部署需另建该角色并授予 DML 权限（见 docs/v6-f8-rls-design.md §3.3）。
--
-- 本迁移选取 5 张【纯请求上下文访问】的核心表（不被后台调度/审计异步写入触及，
-- 故不会因 fails-closed 破坏 F2 审计链/F5 调度）。其余表分批灰度（见设计文档）。
-- 幂等：可重复执行。

do $$
declare
  t text;
  core_tables text[] := array['business_events', 'ledger_entries', 'vouchers', 'invoices', 'contracts'];
begin
  foreach t in array core_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant_isolation', t);
    execute format(
      'create policy %I on %I for all using (company_id = current_setting(''app.current_company'', true)) with check (company_id = current_setting(''app.current_company'', true))',
      t || '_tenant_isolation', t
    );
  end loop;
end $$;
