import test from "node:test";
import assert from "node:assert/strict";
import type { ClosingPackageExport } from "@finance-taxation/domain-model";
import { buildClosingPackageExport, buildClosingPackageHtml } from "./closing-bundle.js";

test("buildClosingPackageExport groups sections by bundle kind", () => {
  const result: ClosingPackageExport = buildClosingPackageExport("month_end", "2026-05", {
    reportSnapshotIds: ["rs-1"],
    taxBatchIds: ["tb-1"],
    riskFindingIds: ["rf-1"]
  });
  assert.equal(result.kind, "month_end");
  assert.equal(result.sections.length > 0, true);
});

test("buildClosingPackageHtml renders package title", () => {
  const bundle = buildClosingPackageExport("audit", "2026-Q2", {
    reportSnapshotIds: ["rs-1"],
    taxBatchIds: ["tb-1"],
    riskFindingIds: []
  });
  const html = buildClosingPackageHtml(bundle);
  assert.equal(html.includes(bundle.title), true);
});
