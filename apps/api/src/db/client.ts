import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;
type PoolClient = pg.PoolClient;

let _pool: pg.Pool | null = null;

/**
 * F8 多租户：当一个请求在租户上下文中运行（见 db/tenant.ts `withTenantRequest`），
 * 该请求专属的、已 `set_config('app.current_company', ...)` 的事务连接被存入此
 * AsyncLocalStorage。`query`/`queryOne`/`withTransaction` 会透明改用它，从而让
 * Postgres RLS 策略对全部既有查询自动生效——无需改写任何 handler。无上下文时
 * （后台任务、测试、未启用 RLS）一切回退到连接池，行为与改造前完全一致。
 */
export interface TenantStore {
  client: PoolClient;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** 当前应使用的执行器：请求内的租户连接，否则连接池。 */
function activeRunner(): pg.Pool | PoolClient {
  return tenantContext.getStore()?.client ?? getPool();
}

export function getPool(): pg.Pool {
  if (!_pool) {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL is not configured — set it in .env or environment");
    }
    _pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
    _pool.on("error", (err) => {
      console.error("[db] idle client error", err.message);
    });
  }
  return _pool;
}

export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await activeRunner().query<T>(sql, params);
  return result.rows;
}

export async function queryOne<T extends object = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Inside a tenant request the whole request is already one transaction on a
  // context-scoped client; reuse it so RLS context is carried and we never nest
  // a second BEGIN (Postgres would otherwise commit both on the inner COMMIT).
  const store = tenantContext.getStore();
  if (store) {
    return fn(store.client);
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
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

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export function isDbAvailable(): boolean {
  return Boolean(env.databaseUrl);
}
