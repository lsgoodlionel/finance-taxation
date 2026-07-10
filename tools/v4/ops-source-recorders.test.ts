import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAiEvalTemplate,
  createBackupRestoreTemplate,
  createConnectorTemplate,
  writeAiEvalSource,
  writeBackupRestoreSource,
  writeConnectorSource
} from "./ops-source-recorders.ts";

test("createBackupRestoreTemplate returns a fillable drill scaffold", () => {
  const template = createBackupRestoreTemplate("2026-07-02T10:00:00.000Z");

  assert.equal(template.metadata.sourceType, "backup-restore");
  assert.match(template.metadata.sourceId, /backup-restore-template-/);
  assert.equal(template.backupCompletedAt, "");
  assert.equal(template.restoreVerifiedAt, "");
  assert.equal(template.rpoHours, 0);
  assert.equal(template.rtoHours, 0);
  assert.match(template.verifiedBy, /fill/i);
});

test("createConnectorTemplate returns the default connector checklist", () => {
  const template = createConnectorTemplate("2026-07-02T10:00:00.000Z");

  assert.equal(template.metadata.sourceType, "connectors");
  assert.equal(template.metadata.artifacts.length, 1);
  assert.deepEqual(
    template.connectors.map((item) => item.key),
    ["invoice_verify", "bank_api", "tax_export", "ocr"]
  );
  assert.ok(template.connectors.every((item) => item.status === "failed"));
});

test("createAiEvalTemplate returns a fillable ai-eval scaffold", () => {
  const template = createAiEvalTemplate("2026-07-02T10:00:00.000Z");

  assert.equal(template.metadata.sourceType, "ai-evals");
  assert.match(template.metadata.summary, /fill/i);
  assert.equal(template.sampleSize, 0);
  assert.equal(template.suggestionAcceptanceRate, 0);
  assert.equal(template.documentRecallRate, 0);
  assert.equal(template.highRiskAutoExecutionCount, 0);
});

test("writeBackupRestoreSource writes a normalized source file under ops-sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-ops-source-backup-"));

  try {
    const outputPath = await writeBackupRestoreSource(root, {
      metadata: {
        schemaVersion: "2026-07-ops-source-v1",
        sourceType: "backup-restore",
        sourceId: "backup-drill-2026-07-02",
        capturedAt: "2026-07-02T10:00:00.000Z",
        summary: "Nightly backup and restore drill for purchase expense baseline.",
        artifacts: [
          {
            kind: "runbook-log",
            path: "artifacts/v4/baseline/ops-sources/evidence/backup-drill-2026-07-02.log"
          }
        ]
      },
      generatedAt: "2026-07-02T10:00:00.000Z",
      backupCompletedAt: "2026-07-02T01:00:00.000Z",
      restoreVerifiedAt: "2026-07-02T03:00:00.000Z",
      rpoHours: 2,
      rtoHours: 2,
      verifiedBy: "ops-runner"
    });

    const content = JSON.parse(await readFile(outputPath, "utf8")) as {
      metadata: { sourceId: string };
      verifiedBy: string;
      rpoHours: number;
    };
    assert.equal(content.metadata.sourceId, "backup-drill-2026-07-02");
    assert.equal(content.verifiedBy, "ops-runner");
    assert.equal(content.rpoHours, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeConnectorSource writes the provided connector certification set", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-ops-source-connectors-"));

  try {
    const outputPath = await writeConnectorSource(root, {
      metadata: {
        schemaVersion: "2026-07-ops-source-v1",
        sourceType: "connectors",
        sourceId: "connector-certification-2026-07-02",
        capturedAt: "2026-07-02T10:00:00.000Z",
        summary: "Connector certification batch covering bank and invoice verification.",
        artifacts: [
          {
            kind: "certification-report",
            path: "artifacts/v4/baseline/ops-sources/evidence/connector-certification-2026-07-02.md"
          }
        ]
      },
      generatedAt: "2026-07-02T10:00:00.000Z",
      connectors: [
        {
          key: "bank_api",
          label: "银行直连",
          status: "passed",
          lastVerifiedAt: "2026-07-02T09:00:00.000Z",
          roundtripMs: 380
        }
      ]
    });

    const content = JSON.parse(await readFile(outputPath, "utf8")) as {
      metadata: { sourceId: string };
      connectors: Array<{ key: string; status: string }>;
    };
    assert.equal(content.metadata.sourceId, "connector-certification-2026-07-02");
    assert.equal(content.connectors[0]?.key, "bank_api");
    assert.equal(content.connectors[0]?.status, "passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeAiEvalSource writes the provided ai-eval metrics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-ops-source-ai-"));

  try {
    const outputPath = await writeAiEvalSource(root, {
      metadata: {
        schemaVersion: "2026-07-ops-source-v1",
        sourceType: "ai-evals",
        sourceId: "ai-eval-batch-2026-07-02",
        capturedAt: "2026-07-02T10:00:00.000Z",
        summary: "Weekly evaluator sample for purchase expense suggestions and document retrieval.",
        artifacts: [
          {
            kind: "eval-report",
            path: "artifacts/v4/baseline/ops-sources/evidence/ai-eval-batch-2026-07-02.jsonl"
          }
        ]
      },
      generatedAt: "2026-07-02T10:00:00.000Z",
      sampleSize: 120,
      suggestionAcceptanceRate: 0.91,
      documentRecallRate: 0.97,
      highRiskAutoExecutionCount: 0,
      falsePositiveRate: 0.03
    });

    const content = JSON.parse(await readFile(outputPath, "utf8")) as {
      metadata: { sourceId: string };
      sampleSize: number;
      suggestionAcceptanceRate: number;
    };
    assert.equal(content.metadata.sourceId, "ai-eval-batch-2026-07-02");
    assert.equal(content.sampleSize, 120);
    assert.equal(content.suggestionAcceptanceRate, 0.91);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
