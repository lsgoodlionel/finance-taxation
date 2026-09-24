import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { env } from "../config/env.js";
import { getPool, closePool } from "./client.js";
import { retryDbStartup } from "./startup.js";

// 迁移文件目录：monorepo 根的 migrations/
//
// `src/db/` 与编译产物 `dist/db/` 深度相同，所以这个相对路径在两边都解析到
// 仓库根——生产镜像跑的是 dist，这一点必须成立。改动目录层级时要一并检查。
const MIGRATIONS_DIR = new URL("../../../../migrations/", import.meta.url);

/**
 * 迁移用的 PostgreSQL advisory lock key。
 *
 * 任意常数，只要全库唯一即可；用一个好认的数字方便排查时
 * `select * from pg_locks where objid = 20260923` 直接定位。
 */
const MIGRATION_LOCK_KEY = 20260923;

export interface MigrationOutcome {
  ok: boolean;
  appliedCount: number;
  error?: string;
}

/**
 * 在**独占的单条连接**上跑完所有未应用的迁移。
 *
 * ## 为什么必须先拿 advisory lock
 *
 * API 容器的启动会跑迁移，而线上通常有多个副本。没有锁时两个副本会同时读到
 * 「某个迁移未应用」然后都去执行它：DDL 撞 `already exists`、
 * `insert into schema_migrations` 撞主键，带数据回填的迁移还会把数据写坏。
 * **滚动发布时这是必然事件，不是偶发。**
 *
 * `pg_advisory_lock` 会让第二个副本**阻塞等待**而不是失败；等它拿到锁时
 * 第一个已经写完 `schema_migrations`，于是它看到"没有未应用的迁移"直接返回。
 *
 * ## 为什么用单条连接而不是连接池
 *
 * advisory lock 绑定在**会话**上。从池里借一条连接加锁、还回去再借另一条解锁，
 * 解的就不是同一个会话的锁。这里显式持有一条 `pg.Client` 从头用到尾。
 */
export async function applyMigrations(connectionString?: string): Promise<MigrationOutcome> {
  // `env.databaseUrl` 可能是 null（没配 DATABASE_URL）。传 null 给 pg 会让它
  // 静默回退到 libpq 的环境变量与默认值，连上一个谁也没预期的库——
  // 在迁移这件事上尤其危险，所以这里明确拒绝。
  const target = connectionString ?? env.databaseUrl;
  if (!target) {
    return { ok: false, appliedCount: 0, error: "DATABASE_URL 没有配置，拒绝猜测连接目标。" };
  }

  const client = new pg.Client({ connectionString: target });
  await client.connect();

  let appliedCount = 0;
  try {
    // 阻塞直到拿到锁。另一个副本正在迁移时，这里等它做完。
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    try {
      await client.query(`
        create table if not exists schema_migrations (
          version    text primary key,
          applied_at timestamptz not null default now()
        )
      `);

      // 拿到锁之后才读已应用集合。**顺序很重要**：先读再加锁的话，
      // 读到的就是过期快照，锁等于没加。
      const { rows: applied } = await client.query<{ version: string }>(
        "select version from schema_migrations order by version"
      );
      const appliedSet = new Set(applied.map((r) => r.version));

      const allFiles = await readdir(MIGRATIONS_DIR);
      const sqlFiles = allFiles.filter((f) => f.endsWith(".sql")).sort();

      for (const file of sqlFiles) {
        if (appliedSet.has(file)) continue;

        const sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
        console.log(`  apply ${file} …`);

        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("insert into schema_migrations (version) values ($1)", [file]);
          await client.query("COMMIT");
          appliedCount++;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }

      console.log(
        appliedCount === 0
          ? "No new migrations to apply."
          : `Applied ${appliedCount} migration(s) successfully.`
      );
    } finally {
      // **失败路径也要解锁。** 加了锁却不在失败时释放，一次迁移失败就会让
      // 之后所有部署静默卡在等锁上——没有报错，只是挂住，比崩溃更难排查。
      //
      // （会话断开时 PostgreSQL 会自动释放，但显式解锁让连接可以复用，
      //   也让 `pg_locks` 在正常路径上保持干净，便于排查时一眼看出异常。）
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }

    return { ok: true, appliedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, appliedCount, error: message };
  } finally {
    await client.end();
  }
}

async function run() {
  let outcome: MigrationOutcome = { ok: false, appliedCount: 0 };
  try {
    await retryDbStartup(
      async () => {
        outcome = await applyMigrations();
        // 迁移本身失败（SQL 报错）不是启动期的瞬时故障，不该重试——
        // 重试只会把同一个坏 SQL 再撞一遍。抛出去让 retryDbStartup 区分不了，
        // 所以这里直接返回，由下面的 outcome.ok 决定退出码。
      },
      {
        maxAttempts: env.dbStartupMaxAttempts,
        delayMs: env.dbStartupDelayMs,
        beforeRetry: async ({ attempt, maxAttempts, delayMs, error }) => {
          console.warn(
            `[migrate] transient database startup error on attempt ${attempt}/${maxAttempts}: ${error.message}; retrying in ${delayMs}ms`
          );
          await closePool();
        }
      }
    );
  } finally {
    await closePool();
  }

  if (!outcome.ok) {
    console.error(`[migrate] FAILED: ${outcome.error ?? "unknown error"}`);
    process.exit(1);
  }
}

// 作为脚本直接运行时才执行；被测试 import 时不自动跑。
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[migrate] FAILED: ${message}`);
    process.exit(1);
  });
}
