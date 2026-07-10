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

  assert.equal(template.backupCompletedAt, "");
  assert.equal(template.restoreVerifiedAt, "");
  assert.equal(template.rpoHours, 0);
  assert.equal(template.rtoHours, 0);
  assert.match(template.verifiedBy, /fill/i);
});

test("createConnectorTemplate returns the default connector checklist", () => {
  const template = createConnectorTemplate("2026-07-02T10:00:00.000Z");

  assert.deepEqual(
    template.connectors.map((item) => item.key),
    ["invoice_verify", "bank_api", "tax_export", "ocr"]
  );
  assert.ok(template.connectors.every((item) => item.status === "failed"));
});

test("createAiEvalTemplate returns a fillable ai-eval scaffold", () => {
  const template = createAiEvalTemplate("2026-07-02T10:00:00.000Z");

  assert.equal(template.sampleSize, 0);
  assert.equal(template.suggestionAcceptanceRate, 0);
  assert.equal(template.documentRecallRate, 0);
  assert.equal(template.highRiskAutoExecutionCount, 0);
});

test("writeBackupRestoreSource writes a normalized source file under ops-sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-ops-source-backup-"));

  try {
    const outputPath = await writeBackupRestoreSource(root, {
      generatedAt: "2026-07-02T10:00:00.000Z",
      backupCompletedAt: "2026-07-02T01:00:00.000Z",
      restoreVerifiedAt: "2026-07-02T03:00:00.000Z",
      rpoHours: 2,
      rtoHours: 2,
      verifiedBy: "ops-runner"
    });

    const content = JSON.parse(await readFile(outputPath, "utf8")) as {
      verifiedBy: string;
      rpoHours: number;
    };
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
      connectors: Array<{ key: string; status: string }>;
    };
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
      generatedAt: "2026-07-02T10:00:00.000Z",
      sampleSize: 120,
      suggestionAcceptanceRate: 0.91,
      documentRecallRate: 0.97,
      highRiskAutoExecutionCount: 0,
      falsePositiveRate: 0.03
    });

    const content = JSON.parse(await readFile(outputPath, "utf8")) as {
      sampleSize: number;
      suggestionAcceptanceRate: number;
    };
    assert.equal(content.sampleSize, 120);
    assert.equal(content.suggestionAcceptanceRate, 0.91);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
