import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordOpsSource } from "./record-ops-source.ts";

test("recordOpsSource imports connector certification JSON into ops-sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-record-ops-source-"));

  try {
    const inputPath = path.join(root, "connector-certification.json");
    await writeFile(
      inputPath,
      JSON.stringify({
        generatedAt: "2026-07-03T08:00:00.000Z",
        connectors: [
          {
            key: "bank_api",
            label: "银行直连",
            status: "passed",
            lastVerifiedAt: "2026-07-03T07:55:00.000Z",
            roundtripMs: 280,
            notes: "招商银行沙箱联通"
          }
        ]
      }, null, 2)
    );

    const result = await recordOpsSource({
      repoRoot: root,
      sourceType: "connectors",
      inputPath
    });

    assert.equal(result.sourceType, "connectors");
    assert.match(result.outputPath, /artifacts\/v4\/baseline\/ops-sources\/connectors\.json$/);

    const written = JSON.parse(await readFile(result.outputPath, "utf8")) as {
      connectors: Array<{ key: string; status: string; roundtripMs: number }>;
    };
    assert.equal(written.connectors[0]?.key, "bank_api");
    assert.equal(written.connectors[0]?.status, "passed");
    assert.equal(written.connectors[0]?.roundtripMs, 280);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recordOpsSource imports backup-restore drill evidence into ops-sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-record-ops-backup-"));

  try {
    const inputPath = path.join(root, "backup-drill.json");
    await writeFile(
      inputPath,
      JSON.stringify({
        generatedAt: "2026-07-03T08:00:00.000Z",
        backupCompletedAt: "2026-07-03T01:00:00.000Z",
        restoreVerifiedAt: "2026-07-03T03:00:00.000Z",
        rpoHours: 2,
        rtoHours: 2,
        verifiedBy: "ops-drill-2026-07"
      }, null, 2)
    );

    const result = await recordOpsSource({
      repoRoot: root,
      sourceType: "backup-restore",
      inputPath
    });

    const written = JSON.parse(await readFile(result.outputPath, "utf8")) as {
      verifiedBy: string;
      rtoHours: number;
    };
    assert.equal(written.verifiedBy, "ops-drill-2026-07");
    assert.equal(written.rtoHours, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package.json exposes v4:ops:record script", async () => {
  const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["v4:ops:record"], "node --import tsx tools/v4/record-ops-source.ts");
});

test("repository ships importable sample ops source payloads", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const sampleDir = path.join(repoRoot, "docs", "v4", "examples", "ops-source-samples");
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "v4-record-ops-samples-"));

  try {
    const backupSamplePath = path.join(sampleDir, "backup-drill.json");
    const connectorSamplePath = path.join(sampleDir, "connector-certification.json");
    const aiEvalSamplePath = path.join(sampleDir, "ai-evals.json");

    await mkdir(sampleDir, { recursive: true });

    const backupResult = await recordOpsSource({
      repoRoot: sandboxRoot,
      sourceType: "backup-restore",
      inputPath: backupSamplePath
    });
    const connectorResult = await recordOpsSource({
      repoRoot: sandboxRoot,
      sourceType: "connectors",
      inputPath: connectorSamplePath
    });
    const aiEvalResult = await recordOpsSource({
      repoRoot: sandboxRoot,
      sourceType: "ai-evals",
      inputPath: aiEvalSamplePath
    });

    const backupWritten = JSON.parse(await readFile(backupResult.outputPath, "utf8")) as { verifiedBy: string };
    const connectorWritten = JSON.parse(await readFile(connectorResult.outputPath, "utf8")) as {
      connectors: Array<{ key: string; status: string }>;
    };
    const aiEvalWritten = JSON.parse(await readFile(aiEvalResult.outputPath, "utf8")) as { sampleSize: number };

    assert.equal(backupWritten.verifiedBy, "ops-drill-sample-2026-07");
    assert.equal(connectorWritten.connectors[0]?.key, "invoice_verify");
    assert.equal(connectorWritten.connectors[0]?.status, "passed");
    assert.equal(aiEvalWritten.sampleSize, 180);
  } finally {
    await rm(sandboxRoot, { recursive: true, force: true });
  }
});
