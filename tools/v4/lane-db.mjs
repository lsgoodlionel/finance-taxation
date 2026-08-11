#!/usr/bin/env node
/**
 * 为并行开发车道分配独立的测试数据库。
 *
 * ## 为什么需要它
 *
 * 集成测试的每个用例都调 `resetTestDatabase()`，而它是 `DROP SCHEMA public CASCADE`。
 * 多条车道同时跑测试时会互相把对方的库删掉，症状是随机的：
 *
 *   error: relation "companies" does not exist
 *   error: deadlock detected
 *   error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
 *
 * V12 批次 B 有两条车道**各自独立**报告了这个问题，都一度误判成自己的代码有 bug。
 * 安静窗口下重跑就全绿 —— 这种「重跑就好了」的失败最消耗信任，也最容易让人养成
 * 忽略红灯的习惯。
 *
 * ## 用法
 *
 *   # 车道开工时
 *   export V4_TEST_DATABASE_URL=$(node tools/v4/lane-db.mjs create my-lane)
 *   npm run v4:test:db:reset && npm run v4:test:seed
 *   npm run test:api:integration
 *
 *   # 收工时（可选，库很小，留着也行）
 *   node tools/v4/lane-db.mjs drop my-lane
 *
 *   # 看看有哪些残留
 *   node tools/v4/lane-db.mjs list
 *
 * 不传 `V4_TEST_DATABASE_URL` 的调用方（本地单人开发、CI 单跑）行为完全不变，
 * 仍然用默认的 `finance_taxation_v4_test`。
 */

import pg from "pg";

const DEFAULT_ADMIN_URL =
  process.env.V4_TEST_ADMIN_URL ??
  "postgres://finance_taxation:finance_taxation@127.0.0.1:55433/postgres";

const BASE_DB = "finance_taxation_v4_test";
const LANE_PREFIX = `${BASE_DB}_lane_`;

/**
 * 车道名归一成合法的库名片段。
 *
 * Postgres 标识符不接受连字符（除非加引号），而车道名常带连字符
 * （`codex/v12-batch-b`、`my-lane`）。统一转下划线并截断，避免超出 63 字节上限。
 */
function normalizeLane(lane) {
  const cleaned = String(lane)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) {
    throw new Error("车道名归一后为空，请用字母或数字开头的名字");
  }
  // 63 是 Postgres 标识符上限，留出前缀的长度
  return cleaned.slice(0, 63 - LANE_PREFIX.length);
}

function laneDatabaseName(lane) {
  return `${LANE_PREFIX}${normalizeLane(lane)}`;
}

function laneUrl(dbName) {
  const url = new URL(DEFAULT_ADMIN_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function withAdmin(fn) {
  const client = new pg.Client({ connectionString: DEFAULT_ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function create(lane) {
  const dbName = laneDatabaseName(lane);
  await withAdmin(async (client) => {
    const existing = await client.query("select 1 from pg_database where datname = $1", [dbName]);
    if (existing.rowCount === 0) {
      // 库名来自 normalizeLane（只含字母数字下划线），此处仍走标识符引用以防万一
      await client.query(`create database "${dbName}"`);
    }
  });
  // stdout 只输出 URL，方便 $(...) 直接取用；说明走 stderr
  process.stderr.write(`车道库就绪：${dbName}\n`);
  process.stdout.write(laneUrl(dbName));
}

async function drop(lane) {
  const dbName = laneDatabaseName(lane);
  await withAdmin(async (client) => {
    // 先踢掉残留连接，否则 DROP 会被占用的会话挡住
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`drop database if exists "${dbName}"`);
  });
  process.stderr.write(`已删除：${dbName}\n`);
}

async function list() {
  const rows = await withAdmin(async (client) => {
    const result = await client.query(
      `select datname, pg_size_pretty(pg_database_size(datname)) as size
       from pg_database where datname like $1 order by datname`,
      [`${LANE_PREFIX}%`]
    );
    return result.rows;
  });
  if (rows.length === 0) {
    process.stderr.write("没有车道库残留\n");
    return;
  }
  for (const row of rows) {
    process.stdout.write(`${row.datname}  ${row.size}\n`);
  }
}

const [command, lane] = process.argv.slice(2);

const usage = `用法：
  node tools/v4/lane-db.mjs create <lane>   # 创建并输出 URL（stdout 只有 URL）
  node tools/v4/lane-db.mjs drop <lane>     # 删除
  node tools/v4/lane-db.mjs list            # 列出残留的车道库
`;

try {
  if (command === "create") {
    if (!lane) throw new Error(`create 需要车道名\n\n${usage}`);
    await create(lane);
  } else if (command === "drop") {
    if (!lane) throw new Error(`drop 需要车道名\n\n${usage}`);
    await drop(lane);
  } else if (command === "list") {
    await list();
  } else {
    process.stderr.write(usage);
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
