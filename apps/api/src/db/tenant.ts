import type { PoolClient } from "pg";
import { getPool } from "./client.js";

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
