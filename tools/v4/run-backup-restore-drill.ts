import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  OPS_SOURCE_SCHEMA_VERSION,
  writeBackupRestoreSource,
  type BackupRestoreSourceInput
} from "./ops-source-recorders.ts";

/**
 * 自动化备份/恢复演练:对隔离测试栈的 Postgres 容器执行一次真实的
 * pg_dump → 恢复到临时库 → 关键表行数校验,并把实测 RPO/RTO 与演练日志
 * 记录为 backup-restore 运维源(供 v4:ops 生成门禁证据)。
 *
 * 这让 backup-restore 门禁在 CI 里由「每次运行的真实演练」支撑,而非占位
 * 模板;connectors / ai-evals 仍需真实环境认证与人工评测,不在此脚本范围。
 */

const MAX_COMMAND_BUFFER = 256 * 1024 * 1024;
const DRILL_DATABASE = "v4_restore_drill";
const VERIFIED_TABLES = [
  "users",
  "user_passwords",
  "business_events",
  "generated_documents",
  "vouchers",
  "tax_items"
] as const;

export interface DrillMeasurements {
  generatedAt: string;
  backupCompletedAt: string;
  restoreStartedAt: string;
  restoreVerifiedAt: string;
  dumpArtifactPath: string;
  logArtifactPath: string;
}

export function computeDrillHours(fromIso: string, toIso: string): number {
  const millis = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(millis) || millis < 0) {
    throw new Error(`invalid drill interval: ${fromIso} -> ${toIso}`);
  }
  // 保留 6 位小数(≈4ms 粒度),避免长浮点噪音进入证据文件。
  return Number((millis / 3_600_000).toFixed(6));
}

export function buildBackupRestoreDrillSource(input: DrillMeasurements): BackupRestoreSourceInput {
  return {
    metadata: {
      schemaVersion: OPS_SOURCE_SCHEMA_VERSION,
      sourceType: "backup-restore",
      sourceId: `backup-restore-ci-drill-${input.generatedAt.slice(0, 10)}`,
      capturedAt: input.generatedAt,
      summary:
        "CI 自动化备份/恢复演练:pg_dump 全库备份,恢复到临时库并校验关键表行数,RPO/RTO 为实测值。",
      artifacts: [
        { kind: "runbook-log", path: input.logArtifactPath },
        { kind: "sql-dump", path: input.dumpArtifactPath }
      ]
    },
    generatedAt: input.generatedAt,
    backupCompletedAt: input.backupCompletedAt,
    restoreVerifiedAt: input.restoreVerifiedAt,
    rpoHours: computeDrillHours(input.backupCompletedAt, input.restoreStartedAt),
    rtoHours: computeDrillHours(input.restoreStartedAt, input.restoreVerifiedAt),
    verifiedBy: "ci-automated-drill:tools/v4/run-backup-restore-drill.ts"
  };
}

interface DrillConfig {
  repoRoot: string;
  container: string;
  dbUser: string;
  dbName: string;
}

function parseArgs(argv: string[]): DrillConfig {
  let repoRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
    }
  }
  return {
    repoRoot: path.resolve(repoRoot),
    container: process.env.V4_TEST_DB_CONTAINER || "finance-taxation-v4-test-db-1",
    dbUser: process.env.V4_TEST_DB_USER || "finance_taxation",
    dbName: process.env.V4_TEST_DB_NAME || "finance_taxation_v4_test"
  };
}

function dockerExec(config: DrillConfig, args: string[], input?: string): string {
  return execFileSync("docker", ["exec", "-i", config.container, ...args], {
    encoding: "utf8",
    input,
    maxBuffer: MAX_COMMAND_BUFFER
  });
}

function psql(config: DrillConfig, database: string, sql: string): string {
  return dockerExec(config, ["psql", "-U", config.dbUser, "-d", database, "-tA", "-c", sql]).trim();
}

function countRows(config: DrillConfig, database: string, table: string): number {
  const value = Number(psql(config, database, `select count(*) from ${table}`));
  if (!Number.isInteger(value)) {
    throw new Error(`unexpected row count for ${database}.${table}`);
  }
  return value;
}

export async function runBackupRestoreDrill(config: DrillConfig) {
  const evidenceDir = path.join(config.repoRoot, "artifacts", "v4", "baseline", "ops-sources", "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const dumpPath = path.join(evidenceDir, "backup-restore-dump.sql");
  const logPath = path.join(evidenceDir, "backup-restore-drill.log");
  const logLines: string[] = [];
  const log = (line: string) => {
    logLines.push(`${new Date().toISOString()} ${line}`);
  };

  const generatedAt = new Date().toISOString();
  log(`drill started against container=${config.container} db=${config.dbName}`);

  // 1) 备份:pg_dump 全库导出并落盘为演练证据。
  const dumpSql = dockerExec(config, ["pg_dump", "-U", config.dbUser, "-d", config.dbName]);
  await writeFile(dumpPath, dumpSql);
  const backupCompletedAt = new Date().toISOString();
  log(`backup completed, dump size=${Buffer.byteLength(dumpSql)} bytes`);

  const restoreStartedAt = new Date().toISOString();
  try {
    // 2) 恢复:重建临时库并回放备份(ON_ERROR_STOP 保证任何失败立刻暴露)。
    psql(config, "postgres", `drop database if exists ${DRILL_DATABASE}`);
    psql(config, "postgres", `create database ${DRILL_DATABASE}`);
    dockerExec(
      config,
      ["psql", "-U", config.dbUser, "-d", DRILL_DATABASE, "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      dumpSql
    );
    log("restore into drill database completed");

    // 3) 校验:关键表行数在源库与恢复库必须一致。
    for (const table of VERIFIED_TABLES) {
      const sourceCount = countRows(config, config.dbName, table);
      const restoredCount = countRows(config, DRILL_DATABASE, table);
      if (sourceCount !== restoredCount) {
        throw new Error(
          `restore verification failed: ${table} source=${sourceCount} restored=${restoredCount}`
        );
      }
      log(`verified ${table}: ${sourceCount} rows match`);
    }
  } finally {
    try {
      psql(config, "postgres", `drop database if exists ${DRILL_DATABASE}`);
    } catch (cleanupError) {
      log(`warning: drill database cleanup failed: ${(cleanupError as Error).message}`);
    }
  }
  const restoreVerifiedAt = new Date().toISOString();
  log("drill verified");

  const source = buildBackupRestoreDrillSource({
    generatedAt,
    backupCompletedAt,
    restoreStartedAt,
    restoreVerifiedAt,
    dumpArtifactPath: path.relative(config.repoRoot, dumpPath),
    logArtifactPath: path.relative(config.repoRoot, logPath)
  });
  await writeFile(logPath, `${logLines.join("\n")}\n`);
  const outputPath = await writeBackupRestoreSource(config.repoRoot, source);

  return {
    outputPath,
    rpoHours: source.rpoHours,
    rtoHours: source.rtoHours,
    verifiedTables: VERIFIED_TABLES.length
  };
}

const isDirectRun = process.argv[1]?.endsWith("run-backup-restore-drill.ts") ?? false;
if (isDirectRun) {
  runBackupRestoreDrill(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      console.error("backup/restore drill failed:", error);
      process.exitCode = 1;
    });
}
