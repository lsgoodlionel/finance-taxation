import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectAuditEvidence,
  generateAcceptanceReport,
  runAcceptanceReport
} from "./generate-acceptance-report.ts";

test("generateAcceptanceReport summarizes one passed and one failed case with screenshot evidence", async () => {
  const playwrightJson = {
    config: {
      rootDir: "/repo/tests/e2e",
      projects: [
        {
          id: "desktop-chromium",
          name: "desktop-chromium",
          outputDir: "/repo/artifacts/v4/baseline/browser/results"
        }
      ]
    },
    suites: [
      {
        title: "purchase-expense.baseline.spec.ts",
        file: "scenarios/purchase-expense.baseline.spec.ts",
        specs: [
          {
            title: "PUR-STD-001 purchase baseline preserves business chain",
            file: "scenarios/purchase-expense.baseline.spec.ts",
            line: 10,
            column: 7,
            tests: [
              {
                projectName: "desktop-chromium",
                expectedStatus: "passed",
                results: [
                  {
                    status: "passed",
                    duration: 1111,
                    startTime: "2026-06-30T00:00:00.000Z",
                    errors: [],
                    attachments: [
                      {
                        name: "截图: purchase-baseline",
                        contentType: "image/png",
                        path: "artifacts/v4/baseline/browser/results/purchase.png"
                      },
                      {
                        name: "resolved-business-chain",
                        contentType: "application/json",
                        body: Buffer.from(JSON.stringify({
                          event: { id: "evt-pur-001" },
                          taskIds: ["task-pur-001"],
                          documentIds: ["doc-pur-001", "doc-pur-002"],
                          voucherIds: ["vou-pur-001"],
                          taxItemIds: ["tax-pur-001"],
                          contractId: null,
                          role: "accountant"
                        })).toString("base64")
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            title: "PUR-ERR-001 purchase baseline reports missing invoice evidence",
            file: "scenarios/purchase-expense.baseline.spec.ts",
            line: 30,
            column: 7,
            tests: [
              {
                projectName: "desktop-chromium",
                expectedStatus: "passed",
                results: [
                  {
                    status: "failed",
                    duration: 2222,
                    startTime: "2026-06-30T00:05:00.000Z",
                    errors: [
                      {
                        message: "invoice bundle mismatch"
                      }
                    ],
                    attachments: [
                      {
                        name: "trace",
                        contentType: "application/zip",
                        path: "artifacts/v4/baseline/browser/results/purchase-trace.zip"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  const report = generateAcceptanceReport({
    runLabel: "baseline",
    commitSha: "abc123",
    generatedAt: "2026-06-30T00:10:00.000Z",
    environment: {
      nodeVersion: "v24.0.0",
      platform: "darwin"
    },
    playwrightResults: playwrightJson
  });

  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 1);
  assert.match(report.markdown, /PUR-STD-001/);
  assert.match(report.markdown, /截图/);
  assert.deepEqual(report.summary.byStatus, {
    blocked: 0,
    failed: 1,
    passed: 1
  });
  const passedCase = report.evidence.find((item) => item.caseId === "PUR-STD-001");
  assert.ok(passedCase);
  assert.deepEqual(passedCase.objectIds, {
    contractIds: [],
    documentIds: ["doc-pur-001", "doc-pur-002"],
    eventIds: ["evt-pur-001"],
    taskIds: ["task-pur-001"],
    taxItemIds: ["tax-pur-001"],
    voucherIds: ["vou-pur-001"]
  });
  assert.equal(passedCase.role, "accountant");
  assert.equal(report.failuresByModule[0]?.module, "purchase_expense");
  assert.equal(report.failuresByModule[0]?.cases[0]?.caseId, "PUR-ERR-001");
});

test("collectAuditEvidence extracts dated markdown audits in stable order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-audit-evidence-"));

  try {
    const auditDir = path.join(root, "docs", "v4", "audits", "baseline");
    await mkdir(auditDir, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(auditDir, "runtime-summary-pages-2026-06-29.md"),
        "# Runtime Summary Pages Audit\n\n日期：2026-06-29\n\n- 5/5 页面均通过 runtime 摘要 smoke。\n"
      ),
      writeFile(
        path.join(auditDir, "design-check-2026-06-28.md"),
        "# Design Check\n\n日期：2026-06-28\n\n- 视觉方向已确认。\n"
      )
    ]);

    const audits = await collectAuditEvidence(path.join(root, "docs", "v4", "audits"));

    assert.deepEqual(
      audits.map((item) => ({
        date: item.date,
        title: item.title
      })),
      [
        { date: "2026-06-28", title: "Design Check" },
        { date: "2026-06-29", title: "Runtime Summary Pages Audit" }
      ]
    );
    assert.match(audits[1]?.summary ?? "", /5\/5 页面均通过/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runAcceptanceReport writes deterministic json and markdown outputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-report-run-"));

  try {
    const browserDir = path.join(root, "artifacts", "v4", "baseline", "browser");
    const reportsDir = path.join(root, "artifacts", "v4", "baseline", "reports");
    const auditsDir = path.join(root, "docs", "v4", "audits", "baseline");
    await Promise.all([
      mkdir(browserDir, { recursive: true }),
      mkdir(reportsDir, { recursive: true }),
      mkdir(auditsDir, { recursive: true })
    ]);

    await writeFile(
      path.join(browserDir, "results.json"),
      JSON.stringify({
        config: {
          rootDir: path.join(root, "tests", "e2e"),
          projects: [{ id: "desktop", name: "desktop", outputDir: browserDir }]
        },
        suites: [
          {
            title: "contract-revenue.exceptions.spec.ts",
            file: "scenarios/contract-revenue.exceptions.spec.ts",
            specs: [
              {
                title: "CON-MISSING-001 contract exception requires acceptance upload",
                file: "scenarios/contract-revenue.exceptions.spec.ts",
                line: 12,
                column: 7,
                tests: [
                  {
                    projectName: "desktop",
                    expectedStatus: "passed",
                    results: [
                      {
                        status: "passed",
                        duration: 500,
                        startTime: "2026-06-30T01:00:00.000Z",
                        errors: [],
                        attachments: []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }, null, 2)
    );
    await writeFile(
      path.join(auditsDir, "runtime-summary-pages-2026-06-29.md"),
      "# Runtime Summary Pages Audit\n\n日期：2026-06-29\n\n- 5/5 页面均通过 runtime 摘要 smoke。\n"
    );

    const report = await runAcceptanceReport({
      repoRoot: root,
      runLabel: "baseline",
      commitSha: "deadbeef",
      generatedAt: "2026-06-30T01:05:00.000Z",
      environment: {
        nodeVersion: "v24.0.0",
        platform: "darwin"
      }
    });

    const jsonPath = path.join(reportsDir, "acceptance-report.json");
    const markdownPath = path.join(reportsDir, "acceptance-report.md");
    const jsonOutput = JSON.parse(await readFile(jsonPath, "utf8")) as {
      summary: { total: number };
      audits: Array<{ title: string }>;
    };
    const markdownOutput = await readFile(markdownPath, "utf8");

    assert.equal(report.summary.total, 1);
    assert.equal(jsonOutput.summary.total, 1);
    assert.equal(jsonOutput.audits[0]?.title, "Runtime Summary Pages Audit");
    assert.match(markdownOutput, /CON-MISSING-001/);
    assert.match(markdownOutput, /缺少截图/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
