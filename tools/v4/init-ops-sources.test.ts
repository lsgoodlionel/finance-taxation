import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeOpsSources } from "./init-ops-sources.ts";

test("initializeOpsSources writes three template source files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-init-ops-sources-"));

  try {
    const result = await initializeOpsSources({
      repoRoot: root,
      generatedAt: "2026-07-02T11:00:00.000Z"
    });

    assert.deepEqual(
      result.files.map((item) => path.basename(item)).sort(),
      ["ai-evals.json", "backup-restore.json", "connectors.json"]
    );

    const backup = await readFile(result.files.find((item) => item.endsWith("backup-restore.json")) ?? "", "utf8");
    const connectors = await readFile(result.files.find((item) => item.endsWith("connectors.json")) ?? "", "utf8");
    const ai = await readFile(result.files.find((item) => item.endsWith("ai-evals.json")) ?? "", "utf8");

    assert.match(backup, /"metadata"/);
    assert.match(backup, /fill-with-operator-or-runbook-id/);
    assert.match(connectors, /connector-certification-template/);
    assert.match(ai, /eval-report/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
