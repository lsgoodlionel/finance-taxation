import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildFeedbackSubmissions,
  createFeedbackFingerprint
} from "./submit-failures-to-feedback.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function makeFailure(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "PUR-ERR-001",
    scenario: "purchase-expense",
    module: "events",
    status: "failed",
    expected: "invoice bundle should be linked to the reimbursement event",
    actual: "invoice bundle mismatch leaves the event in needs_review",
    reportPath: "artifacts/v4/baseline/reports/acceptance-report.json",
    objectIds: {
      eventIds: ["evt-pur-001"],
      taskIds: ["task-pur-001"],
      documentIds: ["doc-pur-001"],
      voucherIds: [],
      taxItemIds: [],
      contractIds: []
    },
    evidence: {
      screenshots: ["artifacts/v4/baseline/browser/results/purchase.png"],
      traces: ["artifacts/v4/baseline/browser/results/purchase-trace.zip"]
    },
    ...overrides
  };
}

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    runLabel: "baseline",
    commitSha: "abc123",
    generatedAt: "2026-06-30T02:00:00.000Z",
    evidence: [makeFailure()],
    ...overrides
  };
}

test("deduplicates repeated failed cases with the same case id and commit sha", () => {
  const report = makeReport({
    evidence: [
      makeFailure(),
      makeFailure({
        scenario: "purchase-expense-tablet",
        actual: "invoice bundle mismatch also reproduced on tablet"
      })
    ]
  });

  const result = buildFeedbackSubmissions(report, {
    history: []
  });

  assert.equal(result.payloads.length, 1);
  assert.equal(result.payloads[0]?.module, "events");
  assert.equal(result.payloads[0]?.title, "[V4验收][PUR-ERR-001] invoice bundle mismatch leaves the event in needs_review");
  assert.match(result.payloads[0]?.content ?? "", /commit: abc123/);
  assert.match(result.payloads[0]?.content ?? "", /fingerprint: /);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0]?.reason, "duplicate_in_report");
  assert.equal(
    result.records[0]?.fingerprint,
    createFeedbackFingerprint({ caseId: "PUR-ERR-001", commitSha: "abc123" })
  );
});

test("creates a new fingerprint only after the previous defect was marked fixed and regressed", () => {
  const caseId = "PUR-ERR-001";
  const openFingerprint = createFeedbackFingerprint({ caseId, commitSha: "abc123" });

  const openResult = buildFeedbackSubmissions(makeReport({ commitSha: "def456" }), {
    history: [
      {
        caseId,
        fingerprint: openFingerprint,
        commitSha: "abc123",
        state: "open"
      }
    ]
  });

  assert.equal(openResult.payloads.length, 0);
  assert.equal(openResult.skipped[0]?.reason, "already_open");
  assert.equal(openResult.skipped[0]?.fingerprint, openFingerprint);

  const regressedResult = buildFeedbackSubmissions(makeReport({ commitSha: "def456" }), {
    history: [
      {
        caseId,
        fingerprint: openFingerprint,
        commitSha: "abc123",
        state: "fixed"
      }
    ]
  });

  assert.equal(regressedResult.payloads.length, 1);
  assert.notEqual(regressedResult.records[0]?.fingerprint, openFingerprint);
  assert.equal(regressedResult.records[0]?.state, "open");
  assert.match(regressedResult.payloads[0]?.content ?? "", /commit: def456/);
});

test("skips passed and blocked external credential cases", () => {
  const report = makeReport({
    evidence: [
      makeFailure({ caseId: "PUR-PASS-001", status: "passed" }),
      makeFailure({
        caseId: "PUR-BLOCK-001",
        status: "blocked",
        actual: "waiting for external sandbox credential",
        blockingReason: "external_credentials"
      }),
      makeFailure({ caseId: "PUR-ERR-001", actual: "real product defect" })
    ]
  });

  const result = buildFeedbackSubmissions(report, {
    history: []
  });

  assert.deepEqual(
    result.payloads.map((payload) => payload.title),
    ["[V4验收][PUR-ERR-001] real product defect"]
  );
  assert.deepEqual(
    result.skipped.map((item) => [item.caseId, item.reason]),
    [
      ["PUR-PASS-001", "non_failure_status"],
      ["PUR-BLOCK-001", "external_dependency"]
    ]
  );
});

test("CLI defaults to dry-run and prints payloads from the acceptance report", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-feedback-cli-"));
  const scriptPath = fileURLToPath(new URL("./submit-failures-to-feedback.ts", import.meta.url));
  const reportPath = path.join(root, "artifacts", "v4", "baseline", "reports", "acceptance-report.json");

  try {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(makeReport(), null, 2));

    const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--report", reportPath], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mode: dry-run/);
    assert.match(result.stdout, /PUR-ERR-001/);
    assert.match(result.stdout, /"category": "bug"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
