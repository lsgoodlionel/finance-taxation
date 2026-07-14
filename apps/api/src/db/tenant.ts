import type { PoolClient } from "pg";
import { getPool, tenantContext } from "./client.js";
import { env } from "../config/env.js";

/**
 * Run `fn` inside a transaction whose connection carries the tenant context,
 * so Postgres Row-Level Security policies of the form
 *
 *   using (company_id = current_setting('app.current_company', true))
 *
 * transparently scope every query to `companyId`. This is the enforcement layer
 * for Stage C multi-tenant isolation: even a query that forgets its explicit
 * `company_id = $1` filter cannot read or write another tenant's rows.
 *
 * `set_config(..., true)` scopes the setting to the current transaction, so it
 * is cleared automatically on COMMIT/ROLLBACK and never leaks across pooled
 * connections.
 */
export async function withTenantContext<T>(
  companyId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!companyId) {
    throw new Error("withTenantContext requires a companyId");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.current_company', $1, true)", [companyId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * F8 请求级租户上下文：为一个请求开启携带 `app.current_company` 的事务连接，放入
 * AsyncLocalStorage，让该请求内所有 `query`/`queryOne`/`withTransaction` 透明改用
 * 它——handler 无需感知，RLS 自动兜底。整个请求成为一个事务（原子）。
 *
 * 与 `withTenantContext` 的区别：后者把 client 显式传给回调；本函数不暴露 client，
 * 靠 ALS 覆盖全局 DB 访问，故适合在 dispatch 层统一包裹既有 handler。
 * 流式/SSE 端点必须豁免（不能为整段流持有一个事务连接）。
 */
export async function withTenantRequest<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  if (!companyId) {
    throw new Error("withTenantRequest requires a companyId");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('app.current_company', $1, true)", [companyId]);
    const result = await tenantContext.run({ client }, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * F8：为流式/SSE 端点的「取数阶段」按需加租户上下文。这类端点被 dispatch 豁免
 * （不能为整段流持有事务），故需自行在读取数据时短暂进入租户上下文，读完即释放
 * 连接再开始流式输出（先取数后流式）。仅当 RLS 启用时才包裹，关闭时零行为变化。
 */
export async function runTenantScoped<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  if (!env.tenantRlsEnabled || !companyId) {
    return fn();
  }
  return withTenantRequest(companyId, fn);
}
