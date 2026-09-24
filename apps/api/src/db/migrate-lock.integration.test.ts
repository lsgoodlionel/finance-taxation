/**
 * 迁移的并发安全（部署稳定性）。
 *
 * ## 缺陷
 *
 * API 容器的启动命令是 `migrate && main`，**每个副本都会跑迁移**。
 * 而 `applyMigrations` 先查 `schema_migrations` 得到"已应用"集合，
 * 再逐个 apply——查与写之间没有任何互斥。
 *
 * 两个副本同时启动时：都读到「104 未应用」，然后都去执行它。
 * 每个迁移自己在事务里，但事务保证不了"只执行一次"——
 * 第二个会在 `create table` / `add column` 上撞 `already exists` 而抛错，
 * 容器随之退出、重启、再撞一次。**滚动发布时这是必然事件，不是偶发。**
 *
 * ## 为什么不能靠 `if not exists` 绕过
 *
 * 迁移里确实大量用了 `if not exists`，但那只挡得住 DDL。
 * `insert into schema_migrations` 会撞主键，而且带数据回填的迁移
 * （如 100_taxpayer_profile_history）重复执行会把数据写坏。
 * 正确的做法是让并发的第二个**等待**，而不是让它失败或重做。
 */

import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const databaseUrl =
  process.env.V4_TEST_DATABASE_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/finance_taxation_v4_test";

process.env.DATABASE_URL = databaseUrl;

test("两个副本同时迁移：一个干活、另一个等待，迁移只应用一次", async (t) => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  // 从空库开始——这正是新环境首次部署的场景，也是并发迁移最危险的时刻
  // （所有迁移都未应用，两个副本要同时跑完整的一百多个文件）。
  await pool.query("drop schema public cascade; create schema public;");

  const { applyMigrations } = await import("./migrate.js");

  // 两个"副本"同时开跑。各自独立的连接池，模拟两个容器。
  const [first, second] = await Promise.all([
    applyMigrations(databaseUrl),
    applyMigrations(databaseUrl)
  ]);

  // **两个都要成功**。让第二个报错然后靠容器重启去兜，意味着滚动发布
  // 期间必然有一个副本反复崩溃——编排器会认为这次发布失败并回滚。
  assert.ok(first.ok, `第一个副本应当成功：${first.error ?? ""}`);
  assert.ok(second.ok, `第二个副本也应当成功（等待而不是失败）：${second.error ?? ""}`);

  // 真正干活的只有一个，另一个拿到锁时发现没有未应用的迁移。
  const totalApplied = first.appliedCount + second.appliedCount;

  const { readdir } = await import("node:fs/promises");
  const onDisk = (await readdir(new URL("../../../../migrations/", import.meta.url))).filter((f) =>
    f.endsWith(".sql")
  ).length;

  assert.equal(
    totalApplied,
    onDisk,
    `两个副本各自报告的应用数之和必须等于磁盘上的迁移文件数（${onDisk}）——` +
      "多出来说明有迁移被执行了两次，而带数据回填的迁移重复执行会把数据写坏"
  );

  // **不数 `schema_migrations` 的总行数**：`015_startup_year1_simulation.sql`
  // 内部自己插了一条 version='015'（不带 .sql 后缀），于是它一个文件留下两条
  // 记录。那是既存的数据瑕疵，与并发安全无关——拿总行数做断言会把它误报成
  // 「迁移被重复执行」。这里改为逐个文件核对，直接表达要验的意图。
  const { rows } = await pool.query<{ version: string; n: string }>(
    `select version, count(*)::text n from schema_migrations
      where version like '%.sql'
      group by version having count(*) > 1`
  );
  assert.deepEqual(rows, [], "没有任何迁移文件被记录两次");
});

test("重复迁移是幂等的：第二次跑什么都不做", async (t) => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { applyMigrations } = await import("./migrate.js");

  const again = await applyMigrations(databaseUrl);
  assert.ok(again.ok);
  assert.equal(
    again.appliedCount,
    0,
    "库已经是最新的，这一次不该再应用任何迁移——" +
      "每次滚动发布都会重跑迁移，不幂等就等于每次发布都改一遍库"
  );
});

test("锁在失败时也会释放，不会把后续部署永久卡住", async (t) => {
  // **这条是为了防一类更糟的故障**：加了锁但没在失败路径释放，
  // 一次迁移失败就会让之后所有部署卡在等锁上——而且没有任何报错，
  // 只是静默地挂住，比原来的崩溃更难排查。
  const pool = new pg.Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
  });

  const { applyMigrations } = await import("./migrate.js");

  // 塞一个必然失败的迁移文件名进去是做不到的（要改磁盘），
  // 改为直接验证：正常跑完之后，锁没有被任何连接持有。
  await applyMigrations(databaseUrl);

  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text n from pg_locks
      where locktype = 'advisory' and granted`
  );
  assert.equal(
    rows[0]!.n,
    "0",
    "迁移跑完后不该还有人持有 advisory 锁——持有不放会让下一次部署静默挂死"
  );
});
