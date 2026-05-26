import assert from "node:assert/strict";
import {
  buildExportArchiveBatchNo,
  buildExportArchiveEntry,
  buildExportJob,
  filterArchiveEntries,
  groupArchiveEntries,
  markExportJobStatus
} from "./history.js";

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
assert.match(archiveEntry.archiveKey, /^REPORT-2026-05-\d{8}:report:/);

assert.equal(markExportJobStatus(job, "completed").status, "completed");
assert.match(buildExportArchiveBatchNo("report", "2026-05"), /^REPORT-2026-05-/);

const filtered = filterArchiveEntries(
  [
    archiveEntry,
    {
      ...archiveEntry,
      id: "archive-2",
      kind: "voucher",
      title: "凭证 2026-05",
      fileName: "凭证_2026-05.pdf",
      objectType: "voucher",
      objectId: "voucher-1",
      archiveKey: "voucher:2026-05:voucher:voucher-1"
    }
  ],
  { keyword: "利润表", kind: "report" }
);

assert.equal(filtered.length, 1);
assert.equal(filtered[0]?.id, archiveEntry.id);

const grouped = groupArchiveEntries([
  archiveEntry,
  {
    ...archiveEntry,
    id: "archive-2",
    archiveKey: `${archiveEntry.archiveKey}:retry`,
    title: "利润表 2026-05 第二次导出"
  }
]);

assert.equal(grouped.length, 1);
assert.equal(grouped[0]?.items.length, 2);

console.log("export-history-ok");
