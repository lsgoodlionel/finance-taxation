import { readdir, readFile } from "node:fs/promises";
import { getPool, closePool } from "./client.js";

// 迁移文件目录：monorepo 根的 migrations/
const MIGRATIONS_DIR = new URL("../../../../migrations/", import.meta.url);

async function run() {
  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows: applied } = await pool.query<{ version: string }>(
    "select version from schema_migrations order by version"
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  const allFiles = await readdir(MIGRATIONS_DIR);
  const sqlFiles = allFiles.filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of sqlFiles) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
    console.log(`  apply ${file} …`);

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (version) values ($1)", [file]);
      await pool.query("COMMIT");
      count++;
      console.log(`  done  ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  if (count === 0) {
    console.log("No new migrations to apply.");
  } else {
    console.log(`\nApplied ${count} migration(s) successfully.`);
  }

  await closePool();
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[migrate] FAILED: ${message}`);
  process.exit(1);
});
