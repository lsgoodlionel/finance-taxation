import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackupRestoreDrillSource, computeDrillHours } from "./run-backup-restore-drill.ts";
import { validateImportedBackupRestoreSource } from "./ops-source-recorders.ts";

const MEASUREMENTS = {
  generatedAt: "2026-07-13T10:00:00.000Z",
  backupCompletedAt: "2026-07-13T10:00:03.000Z",
  restoreStartedAt: "2026-07-13T10:00:03.600Z",
  restoreVerifiedAt: "2026-07-13T10:00:21.600Z",
  dumpArtifactPath: "artifacts/v4/baseline/ops-sources/evidence/backup-restore-dump.sql",
  logArtifactPath: "artifacts/v4/baseline/ops-sources/evidence/backup-restore-drill.log"
};

test("computeDrillHours converts elapsed millis to fractional hours", () => {
  assert.equal(computeDrillHours("2026-07-13T10:00:00.000Z", "2026-07-13T11:30:00.000Z"), 1.5);
  assert.equal(computeDrillHours("2026-07-13T10:00:00.000Z", "2026-07-13T10:00:00.000Z"), 0);
});

test("computeDrillHours rejects a negative interval", () => {
  assert.throws(() => computeDrillHours("2026-07-13T11:00:00.000Z", "2026-07-13T10:00:00.000Z"), /invalid drill interval/);
});

test("buildBackupRestoreDrillSource produces an importable drill source", () => {
  const source = buildBackupRestoreDrillSource(MEASUREMENTS);
  // 与人工 v4:ops:record 走同一校验,保证生成器会将其识别为真实 drill 证据。
  validateImportedBackupRestoreSource(source);
  assert.equal(source.metadata.sourceType, "backup-restore");
  assert.equal(source.metadata.artifacts.length, 2);
  assert.equal(source.rpoHours, computeDrillHours(MEASUREMENTS.backupCompletedAt, MEASUREMENTS.restoreStartedAt));
  assert.equal(source.rtoHours, 0.005);
  assert.ok(source.rpoHours < 24 && source.rtoHours < 4, "drill must satisfy gate thresholds");
});
