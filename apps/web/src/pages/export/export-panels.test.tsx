import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExportArchiveEntry, ExportJob } from "@finance-taxation/domain-model";
import { ExportArchivePanel } from "./ExportArchivePanel";
import { ExportAuditPanel } from "./ExportAuditPanel";
import { ExportHistoryPanel } from "./ExportHistoryPanel";
import { ExportReportsPanel } from "./ExportReportsPanel";
import { ExportSceneSummary } from "./ExportSceneSummary";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const jobs: ExportJob[] = [{
  id: "job-1",
  companyId: "company-demo",
  kind: "report",
  label: "利润表 2026-05",
  fileName: "利润表_2026-05.pdf",
  resourceType: "report_snapshot",
  resourceId: "snap-1",
  periodLabel: "2026-05",
  status: "opened",
  retryCount: 1,
  lastError: "归档索引写入失败，等待重试",
  lastAttemptAt: "2026-05-27T10:05:00.000Z",
  nextRetryAt: "2026-05-27T10:20:00.000Z",
  completedAt: null,
  createdByUserId: null,
  createdByName: "系统",
  createdAt: "2026-05-27T10:00:00.000Z",
}];

const archiveEntries: ExportArchiveEntry[] = [{
  id: "archive-1",
  companyId: "company-demo",
  jobId: "job-1",
  kind: "report",
  archiveKey: "BATCH-001:report:snap-1",
  title: "利润表 2026-05",
  fileName: "利润表_2026-05.pdf",
  objectType: "report_snapshot",
  objectId: "snap-1",
  periodLabel: "2026-05",
  createdAt: "2026-05-27T10:00:00.000Z"
}];

const historyHtml = renderToStaticMarkup(createElement(ExportHistoryPanel, {
  jobs,
  onUpdateStatus: () => {},
  renderActionButton: (_onClick: () => void, label: string) => createElement("button", null, label),
  cellStyle: () => ({ borderBottom: "1px solid #eee", padding: "8px", textAlign: "left" as const })
}));

assert(historyHtml.includes("最近导出记录"), "expected export history title");
assert(historyHtml.includes("利润表 2026-05"), "expected export history row");
assert(historyHtml.includes("重试：1 次"), "expected retry count");
assert(historyHtml.includes("失败原因：归档索引写入失败，等待重试"), "expected last error");
assert(historyHtml.includes("下次重试："), "expected next retry time");

const archiveHtml = renderToStaticMarkup(createElement(ExportArchivePanel, {
  archiveEntries,
  archiveKindFilter: "",
  archiveKeyword: "",
  onKindFilterChange: () => {},
  onKeywordChange: () => {},
  cellStyle: () => ({ borderBottom: "1px solid #eee", padding: "8px", textAlign: "left" as const })
}));

assert(archiveHtml.includes("导出归档索引"), "expected export archive title");
assert(archiveHtml.includes("BATCH-001"), "expected export archive batch");

const auditHtml = renderToStaticMarkup(createElement(ExportAuditPanel, {
  logs: [{
    id: "audit-1",
    companyId: "company-demo",
    userId: null,
    action: "retry",
    resourceType: "export_job",
    resourceId: "job-1",
    resourceLabel: "利润表 2026-05",
    userName: "系统",
    changes: { retryCount: 1, lastError: "归档索引写入失败，等待重试" },
    createdAt: "2026-05-27T10:00:00.000Z"
  }],
  cellStyle: () => ({ borderBottom: "1px solid #eee", padding: "8px", textAlign: "left" as const })
}));

assert(auditHtml.includes("导出审计轨迹"), "expected export audit title");
assert(auditHtml.includes("重试"), "expected export audit action label");
assert(auditHtml.includes("重试次数：1"), "expected export audit change summary");

const reportsHtml = renderToStaticMarkup(createElement(ExportReportsPanel, {
  snapshots: [{
    id: "snap-1",
    companyId: "company-demo",
    reportType: "profit_statement",
    periodType: "month",
    periodLabel: "2026-05",
    snapshotDate: "2026-05-27",
    payload: {
      periodLabel: "2026-05",
      revenues: [],
      costsAndExpenses: [],
      totals: {
        revenue: "100.00",
        cost: "50.00",
        grossProfit: "50.00",
        expenses: "10.00",
        totalProfit: "40.00",
        netProfit: "40.00"
      }
    },
    createdAt: "2026-05-27T10:00:00.000Z"
  }],
  selectedIds: [],
  onToggleSelection: () => {},
  onBatchOpen: () => {},
  onOpenSnapshot: () => {},
  buildFileName: () => "利润表_2026-05_快照.pdf",
  cellStyle: () => ({ borderBottom: "1px solid #eee", padding: "8px", textAlign: "left" as const }),
  batchButtonStyle: { padding: "4px" }
}));

assert(reportsHtml.includes("财务报表快照导出"), "expected reports panel title");
assert(reportsHtml.includes("利润表"), "expected reports panel content");

const summaryHtml = renderToStaticMarkup(createElement(ExportSceneSummary, {
  scene: "reports",
  title: "财务报表导出",
  description: "按期间选择报表快照并导出。",
  highlights: ["1 条快照", "支持批量打开"],
  pendingCount: 1
}));

assert(summaryHtml.includes("财务报表导出"), "expected scene summary title");
assert(summaryHtml.includes("支持批量打开"), "expected scene summary highlight");
