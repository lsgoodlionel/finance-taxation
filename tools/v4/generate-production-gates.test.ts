import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectHealthProbeLatencies,
  createRenderableAiEvalSource,
  createRenderableBackupRestoreSource,
  createRenderableConnectorSource,
  generateAiEvalEvidence,
  generateBackupRestoreEvidence,
  generateConnectorEvidence,
  generateLoadEvidence,
  runProductionEvidenceGeneration
} from "./generate-production-gates.ts";

test("generateLoadEvidence derives page P95 from Playwright results and API P95 from health probes", () => {
  const evidence = generateLoadEvidence({
    playwrightResults: {
      suites: [
        {
          file: "smoke.spec.ts",
          specs: [
            {
              title: "smoke case",
              tests: [
                {
                  results: [
                    { status: "passed", duration: 1200 },
                    { status: "passed", duration: 1800 },
                    { status: "passed", duration: 2000 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    healthProbeLatenciesMs: [140, 160, 220, 260, 300]
  });

  assert.equal(evidence.samples, 3);
  assert.equal(evidence.pageP95Ms, 2000);
  assert.equal(evidence.apiP95Ms, 300);
  assert.deepEqual(evidence.scenarios, ["smoke"]);
});

test("template-like backup-restore source is treated as missing evidence", () => {
  const source = createRenderableBackupRestoreSource({
    metadata: {
      schemaVersion: "2026-07-ops-source-v1",
      sourceType: "backup-restore",
      sourceId: "backup-restore-template-2026-07-02",
      capturedAt: "2026-07-02T10:00:00.000Z",
      summary: "fill with completed backup drill context",
      artifacts: []
    },
    generatedAt: "2026-07-02T10:00:00.000Z",
    backupCompletedAt: "",
    restoreVerifiedAt: "",
    rpoHours: 0,
    rtoHours: 0,
    verifiedBy: "fill-with-operator-or-runbook-id"
  });

  assert.equal(source, null);
});

test("template-like connector source is treated as missing evidence", () => {
  const source = createRenderableConnectorSource({
    metadata: {
      schemaVersion: "2026-07-ops-source-v1",
      sourceType: "connectors",
      sourceId: "connector-certification-template-2026-07-02",
      capturedAt: "2026-07-02T10:00:00.000Z",
      summary: "fill with certification batch context",
      artifacts: []
    },
    generatedAt: "2026-07-02T10:00:00.000Z",
    connectors: [
      {
        key: "bank_api",
        label: "银行直连",
        status: "failed",
        lastVerifiedAt: "",
        roundtripMs: 0,
        notes: "fill with certification result"
      }
    ]
  });

  assert.equal(source, null);
});

test("template-like ai-eval source is treated as missing evidence", () => {
  const source = createRenderableAiEvalSource({
    metadata: {
      schemaVersion: "2026-07-ops-source-v1",
      sourceType: "ai-evals",
      sourceId: "ai-evals-template-2026-07-02",
      capturedAt: "2026-07-02T10:00:00.000Z",
      summary: "fill with ai evaluation summary",
      artifacts: []
    },
    generatedAt: "2026-07-02T10:00:00.000Z",
    sampleSize: 0,
    suggestionAcceptanceRate: 0,
    documentRecallRate: 0,
    highRiskAutoExecutionCount: 0,
    falsePositiveRate: 0
  });

  assert.equal(source, null);
});

test("collectHealthProbeLatencies measures repeated successful probes", async () => {
  let calls = 0;
  const latencies = await collectHealthProbeLatencies({
    iterations: 3,
    probeImpl: async () => {
      calls += 1;
      return true;
    }
  });

  assert.equal(calls, 3);
  assert.equal(latencies.length, 3);
  assert.ok(latencies.every((value) => value >= 0));
});

test("package.json runs v4:ops through the shell wrapper entrypoint", async () => {
  const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["v4:ops"], "bash tools/v4/run-production-gates-generation.sh");
});

test("generateBackupRestoreEvidence emits failing placeholder evidence when no source drill exists", () => {
  const generatedAt = "2026-07-02T09:00:00.000Z";
  const evidence = generateBackupRestoreEvidence({
    generatedAt,
    source: null
  });

  assert.equal(evidence.generatedAt, generatedAt);
  assert.equal(evidence.rpoHours, 999);
  assert.equal(evidence.rtoHours, 999);
  assert.match(evidence.verifiedBy, /missing evidence/i);
  assert.equal(evidence.sourceContext.sourceId, "missing-backup-restore-source");
});

test("generateConnectorEvidence keeps failed status and notes when certification source is missing", () => {
  const evidence = generateConnectorEvidence({
    generatedAt: "2026-07-02T09:00:00.000Z",
    source: null
  });

  assert.equal(evidence.connectors.length > 0, true);
  assert.ok(evidence.connectors.every((item) => item.status === "failed"));
  assert.ok(evidence.connectors.every((item) => item.notes?.includes("missing certification evidence")));
  assert.equal(evidence.sourceContext.sourceId, "missing-connectors-source");
});

test("generateAiEvalEvidence uses acceptance report warnings as fallback and marks the gate below threshold", () => {
  const evidence = generateAiEvalEvidence({
    generatedAt: "2026-07-02T09:00:00.000Z",
    source: null,
    acceptanceReport: {
      warnings: ["缺少截图", "缺少业务对象 ID"],
      summary: { total: 6, passed: 4, failed: 1, blocked: 1, byStatus: { passed: 4, failed: 1, blocked: 1 } }
    }
  });

  assert.equal(evidence.sampleSize, 6);
  assert.equal(evidence.suggestionAcceptanceRate < 0.85, true);
  assert.equal(evidence.documentRecallRate < 0.95, true);
  assert.equal(evidence.highRiskAutoExecutionCount, 1);
  assert.equal(evidence.sourceContext.sourceId, "acceptance-report-fallback");
});

test("runProductionEvidenceGeneration writes all four ops evidence files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-production-evidence-"));

  try {
    const browserDir = path.join(root, "artifacts", "v4", "baseline", "browser");
    const reportsDir = path.join(root, "artifacts", "v4", "baseline", "reports");
    await Promise.all([
      mkdir(browserDir, { recursive: true }),
      mkdir(reportsDir, { recursive: true })
    ]);

    await writeFile(
      path.join(browserDir, "results.json"),
      JSON.stringify({
        suites: [
          {
            file: "scenarios/purchase-expense.baseline.spec.ts",
            specs: [
              {
                title: "PUR-STD-001 purchase baseline",
                tests: [{ results: [{ status: "passed", duration: 1100 }] }]
              }
            ]
          }
        ]
      }, null, 2)
    );
    await writeFile(
      path.join(reportsDir, "acceptance-report.json"),
      JSON.stringify({
        warnings: [],
        summary: { total: 1, passed: 1, failed: 0, blocked: 0, byStatus: { passed: 1, failed: 0, blocked: 0 } }
      }, null, 2)
    );
    await mkdir(path.join(root, "artifacts", "v4", "baseline", "ops-sources"), { recursive: true });
    await writeFile(
      path.join(root, "artifacts", "v4", "baseline", "ops-sources", "backup-restore.json"),
      JSON.stringify({
        metadata: {
          schemaVersion: "2026-07-ops-source-v1",
          sourceType: "backup-restore",
          sourceId: "backup-drill-2026-07-02",
          capturedAt: "2026-07-02T08:00:00.000Z",
          summary: "Restore drill from the purchase expense staging backup.",
          artifacts: [
            {
              kind: "runbook-log",
              path: "artifacts/v4/baseline/ops-sources/evidence/backup-drill-2026-07-02.log"
            }
          ]
        },
        generatedAt: "2026-07-02T08:00:00.000Z",
        backupCompletedAt: "2026-07-02T05:00:00.000Z",
        restoreVerifiedAt: "2026-07-02T07:00:00.000Z",
        rpoHours: 2,
        rtoHours: 2,
        verifiedBy: "ops-drill-2026-07"
      }, null, 2)
    );

    await runProductionEvidenceGeneration({
      repoRoot: root,
      generatedAt: "2026-07-02T09:00:00.000Z",
      healthProbeLatenciesMs: [200, 240]
    });

    const opsDir = path.join(root, "artifacts", "v4", "baseline", "ops");
    const files = ["load.json", "backup-restore.json", "connectors.json", "ai-evals.json"];
    const outputs = await Promise.all(files.map((file) => readFile(path.join(opsDir, file), "utf8")));

    assert.equal(outputs.length, 4);
    assert.match(outputs[0] ?? "", /pageP95Ms/);
    assert.match(outputs[1] ?? "", /rpoHours/);
    assert.match(outputs[1] ?? "", /sourceContext/);
    assert.match(outputs[2] ?? "", /connectors/);
    assert.match(outputs[3] ?? "", /suggestionAcceptanceRate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
