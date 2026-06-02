import type { GeneratedDocument } from "@finance-taxation/domain-model";
import { buildDocumentsSummary, formatFileSize, shortId } from "./documents-helpers";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeDoc(overrides: Partial<GeneratedDocument> = {}): GeneratedDocument {
  return {
    id: "doc-1",
    companyId: "c-1",
    businessEventId: "evt-1",
    documentType: "expense_claim",
    title: "单据",
    status: "draft",
    ownerDepartment: "财务",
    attachmentIds: [],
    notes: "",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides
  } as GeneratedDocument;
}

const summary = buildDocumentsSummary([
  makeDoc({ id: "1", status: "draft", attachmentIds: [] }),
  makeDoc({ id: "2", status: "ready", attachmentIds: ["a1"] }),
  makeDoc({ id: "3", status: "archived", attachmentIds: ["a2"] }),
  makeDoc({ id: "4", status: "awaiting_upload", attachmentIds: [] })
]);

assertEqual(summary.total, 4, "total 应为 4");
assertEqual(summary.archivedCount, 1, "已归档应为 1");
// 缺附件且非归档：id 1(draft) + id 4(awaiting_upload) = 2
assertEqual(summary.pendingUploadCount, 2, "待上传附件应为 2");
assertEqual(summary.statusBreakdown.length, 4, "应有 4 个非空状态桶");
assertEqual(
  summary.statusBreakdown.find((b) => b.status === "draft")?.count,
  1,
  "draft 计数应为 1"
);
// 已归档单据缺附件不计入待上传
const archivedNoAtt = buildDocumentsSummary([makeDoc({ status: "archived", attachmentIds: [] })]);
assertEqual(archivedNoAtt.pendingUploadCount, 0, "已归档缺附件不计入待上传");

// 空集合
const empty = buildDocumentsSummary([]);
assertEqual(empty.total, 0, "空集合 total 为 0");
assertEqual(empty.statusBreakdown.length, 0, "空集合无状态桶");

// formatFileSize
assertEqual(formatFileSize(512), "512 B", "字节格式");
assertEqual(formatFileSize(2048), "2.0 KB", "KB 格式");
assertEqual(formatFileSize(3 * 1024 * 1024), "3.0 MB", "MB 格式");

// shortId
assertEqual(shortId("doc-abcdef123456"), "123456", "取末 6 位并大写");
