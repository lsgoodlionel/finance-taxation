import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = resolve(repoRoot, "migrations");

export function assertSafeTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("V4_TEST_DATABASE_URL must be a valid database URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(`Refusing to reset non-test database: ${databaseName || "<empty>"}`);
  }
}

export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  assertSafeTestDatabase(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.query(`
      CREATE TABLE schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error(`No SQL migrations found in ${migrationsDir}`);
    }

    for (const file of migrationFiles) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(await readFile(resolve(migrationsDir, file), "utf8"));
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`reset test database with ${migrationFiles.length} migration(s)`);
  } finally {
    await pool.end();
  }
}

const entryPath = process.argv[1];
if (
  entryPath &&
  realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(import.meta.url))
) {
  const main = async () => {
    const databaseUrl = process.env.V4_TEST_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("V4_TEST_DATABASE_URL is required");
    }
    await resetTestDatabase(databaseUrl);
  };

  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
