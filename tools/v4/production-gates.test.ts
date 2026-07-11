import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  evaluateProductionGate,
  resolveEvidencePath,
  runProductionGate
} from "./production-gates.ts";

test("evaluateProductionGate passes load gate when P95 and error rate stay within threshold", () => {
  const result = evaluateProductionGate("load", {
    generatedAt: "2026-07-01T10:00:00.000Z",
    samples: 480,
    pageP95Ms: 1820,
    apiP95Ms: 420,
    errorRate: 0.007,
    scenarios: ["purchase_expense", "travel_expense", "contract_revenue"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.match(result.summary, /page p95 1820ms/i);
});

test("evaluateProductionGate fails backup-restore gate when RPO and RTO exceed spec", () => {
  const result = evaluateProductionGate("backup-restore", {
    generatedAt: "2026-07-01T10:00:00.000Z",
    backupCompletedAt: "2026-07-01T01:00:00.000Z",
    restoreVerifiedAt: "2026-07-01T10:00:00.000Z",
    rpoHours: 30,
    rtoHours: 6,
    verifiedBy: "ops"
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    "RPO 30h exceeds 24h threshold",
    "RTO 6h exceeds 4h threshold"
  ]);
});

test("evaluateProductionGate fails connectors gate when any connector is not certified", () => {
  const result = evaluateProductionGate("connectors", {
    generatedAt: "2026-07-01T10:00:00.000Z",
    connectors: [
      {
        key: "ocr",
        label: "OCR",
        status: "passed",
        lastVerifiedAt: "2026-07-01T08:00:00.000Z",
        roundtripMs: 320
      },
      {
        key: "bank",
        label: "Bank",
        status: "failed",
        lastVerifiedAt: "2026-07-01T08:10:00.000Z",
        roundtripMs: 1180,
        notes: "sandbox token expired"
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    "Connector bank is failed",
    "Connector bank note: sandbox token expired"
  ]);
});

test("runProductionGate reads evidence from disk and returns passing AI eval summary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-production-gates-"));

  try {
    const evidencePath = resolveEvidencePath(root, "ai-evals");
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(
      evidencePath,
      JSON.stringify({
        generatedAt: "2026-07-01T10:00:00.000Z",
        sampleSize: 120,
        suggestionAcceptanceRate: 0.91,
        documentRecallRate: 0.97,
        highRiskAutoExecutionCount: 0,
        falsePositiveRate: 0.03
      }, null, 2)
    );

    const result = await runProductionGate({
      repoRoot: root,
      gate: "ai-evals"
    });

    assert.equal(result.ok, true);
    assert.equal(result.failures.length, 0);
    assert.match(result.summary, /acceptance rate 91.0%/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI exits non-zero when evidence is missing", () => {
  const scriptPath = fileURLToPath(new URL("./production-gates.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "load", "--repo-root", "/tmp/does-not-exist"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing evidence/i);
});
