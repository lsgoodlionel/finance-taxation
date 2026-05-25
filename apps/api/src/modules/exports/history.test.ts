import assert from "node:assert/strict";
import { buildExportArchiveEntry, buildExportJob } from "./history.js";

const job = buildExportJob({
  companyId: "company-1",
  userId: "user-1",
  userName: "finance",
  kind: "report",
  label: "利润表 2026-05",
  fileName: "利润表_2026-05_快照.pdf",
  resourceType: "report_snapshot",
  resourceId: "snapshot-1",
  periodLabel: "2026-05"
});

assert.equal(job.companyId, "company-1");
assert.equal(job.kind, "report");
assert.equal(job.status, "created");
assert.equal(job.resourceType, "report_snapshot");
assert.equal(job.periodLabel, "2026-05");

const archiveEntry = buildExportArchiveEntry({
  companyId: "company-1",
  jobId: job.id,
  kind: "report",
  label: job.label,
  fileName: job.fileName,
  resourceType: "report_snapshot",
  resourceId: "snapshot-1",
  periodLabel: "2026-05"
});

assert.equal(archiveEntry.companyId, "company-1");
assert.equal(archiveEntry.jobId, job.id);
assert.equal(archiveEntry.objectType, "report_snapshot");
assert.equal(archiveEntry.objectId, "snapshot-1");
assert.equal(archiveEntry.periodLabel, "2026-05");
assert.match(archiveEntry.archiveKey, /^report:/);

console.log("export-history-ok");
