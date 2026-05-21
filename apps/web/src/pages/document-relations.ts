import type {
  DocumentAttachmentRecord,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";

type DocumentLike = Pick<
  GeneratedDocument,
  | "id"
  | "businessEventId"
  | "documentType"
  | "title"
  | "ownerDepartment"
  | "status"
  | "createdAt"
  | "archivedAt"
> & {
  notes?: string | null;
  attachments?: DocumentAttachmentRecord[];
};

interface BuildDocumentRelationsInput {
  document: DocumentLike;
  tasks: Task[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
}

interface PrintableDocumentInput {
  document: DocumentLike;
  tasks: Task[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
}

export function buildDocumentRelations(input: BuildDocumentRelationsInput) {
  const { businessEventId } = input.document;
  return {
    tasks: input.tasks.filter((item) => item.businessEventId === businessEventId),
    taxItems: input.taxItems.filter((item) => item.businessEventId === businessEventId),
    vouchers: input.vouchers.filter((item) => item.businessEventId === businessEventId)
  };
}

export function supportsPrintableDocument(documentType: string) {
  return documentType === "expense_claim" || documentType === "invoice_bundle";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return "<li>无</li>";
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function buildPrintableDocumentHtml(input: PrintableDocumentInput) {
  const related = buildDocumentRelations(input);
  const attachments = input.document.attachments ?? [];
  const rows: Array<[string, string]> = [
    ["单据编号", input.document.id],
    ["单据名称", input.document.title],
    ["单据类型", input.document.documentType],
    ["责任部门", input.document.ownerDepartment || "—"],
    ["状态", input.document.status],
    ["关联事项", input.document.businessEventId || "—"],
    ["创建日期", input.document.createdAt?.slice(0, 10) || "—"],
    ["归档日期", input.document.archivedAt?.slice(0, 10) || "—"]
  ];

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.document.title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1e2a37; margin: 32px; }
      h1 { text-align: center; margin: 0 0 6px; font-size: 22px; }
      h2 { font-size: 16px; margin: 28px 0 10px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      td { border: 1px solid #d7dee7; padding: 8px 10px; vertical-align: top; }
      td:first-child { width: 120px; color: #526274; background: #f6f8fb; font-weight: 600; }
      .note { padding: 12px 14px; background: #f6f8fb; border-left: 4px solid #4f8ef7; line-height: 1.75; font-size: 13px; }
      ul { margin: 6px 0 0 18px; padding: 0; line-height: 1.8; font-size: 13px; }
      .muted { color: #708090; font-size: 12px; text-align: center; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(input.document.title)}</h1>
    <div class="muted">打印时间：${new Date().toLocaleString("zh-CN")}</div>

    <h2>单据信息</h2>
    <table>
      <tbody>
        ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
      </tbody>
    </table>

    <h2>单据说明</h2>
    <div class="note">${escapeHtml(input.document.notes || "无")}</div>

    <h2>原始凭证附件</h2>
    <ul>${renderList(attachments.map((item) => `${item.fileName} (${item.fileType || "未知类型"})`))}</ul>

    <h2>关联任务</h2>
    <ul>${renderList(related.tasks.map((item) => `${item.title}｜${item.assigneeDepartment || "未分配部门"}｜${item.status}`))}</ul>

    <h2>关联税务事项</h2>
    <ul>${renderList(related.taxItems.map((item) => `${item.taxType}｜${item.filingPeriod}｜${item.treatment}`))}</ul>

    <h2>关联凭证</h2>
    <ul>${renderList(related.vouchers.map((item) => `${item.id}｜${item.summary}｜${item.status}`))}</ul>
  </body>
</html>`;
}
