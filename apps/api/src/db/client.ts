import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;
type PoolClient = pg.PoolClient;

let _pool: pg.Pool | null = null;

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
  const result = await getPool().query<T>(sql, params);
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
