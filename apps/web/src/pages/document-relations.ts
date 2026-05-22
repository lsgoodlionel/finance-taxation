import type {
  DocumentAttachmentRecord,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpenseClaimTemplate } from "./document-templates/ExpenseClaimTemplate";
import { InvoiceBundleTemplate } from "./document-templates/InvoiceBundleTemplate";

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
type PrintableDocumentType = "expense_claim" | "invoice_bundle";

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

export interface ExpenseDocumentTemplateModel {
  documentType: PrintableDocumentType;
  title: string;
  documentId: string;
  businessEventId: string;
  ownerDepartment: string;
  status: string;
  createdOn: string;
  archivedOn: string | null;
  notes: string | null;
  attachments: DocumentAttachmentRecord[];
  relationSummary: ReturnType<typeof buildDocumentRelations>;
}

export function buildDocumentRelations(input: BuildDocumentRelationsInput) {
  const { businessEventId } = input.document;
  return {
    tasks: input.tasks.filter((item) => item.businessEventId === businessEventId),
    taxItems: input.taxItems.filter((item) => item.businessEventId === businessEventId),
    vouchers: input.vouchers.filter((item) => item.businessEventId === businessEventId)
  };
}

export function supportsPrintableDocument(documentType: string): documentType is PrintableDocumentType {
  return documentType === "expense_claim" || documentType === "invoice_bundle";
}

export function getExpenseDocumentTemplateKind(documentType: string): PrintableDocumentType | null {
  if (documentType === "expense_claim") {
    return "expense_claim";
  }

  if (documentType === "invoice_bundle") {
    return "invoice_bundle";
  }

  return null;
}

export function buildExpenseDocumentTemplateModel(
  input: PrintableDocumentInput
): ExpenseDocumentTemplateModel {
  if (!supportsPrintableDocument(input.document.documentType)) {
    throw new Error(`Unsupported printable document type: ${input.document.documentType}`);
  }

  return {
    documentType: input.document.documentType,
    title: input.document.title,
    documentId: input.document.id,
    businessEventId: input.document.businessEventId,
    ownerDepartment: input.document.ownerDepartment || "—",
    status: input.document.status,
    createdOn: input.document.createdAt?.slice(0, 10) || "—",
    archivedOn: input.document.archivedAt?.slice(0, 10) || null,
    notes: input.document.notes || null,
    attachments: input.document.attachments ?? [],
    relationSummary: buildDocumentRelations(input)
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPrintableDocumentHtml(input: PrintableDocumentInput) {
  const model = buildExpenseDocumentTemplateModel(input);
  const templateKind = getExpenseDocumentTemplateKind(model.documentType);
  const template = templateKind === "invoice_bundle" ? InvoiceBundleTemplate : ExpenseClaimTemplate;
  const bodyContent = renderToStaticMarkup(createElement(template, { model }));

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(model.title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1e2a37; margin: 32px; }
      h1 { text-align: center; margin: 0 0 6px; font-size: 22px; }
      h2 { font-size: 16px; margin: 28px 0 10px; }
      section { margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      td { border: 1px solid #d7dee7; padding: 8px 10px; vertical-align: top; }
      td:first-child { width: 120px; color: #526274; background: #f6f8fb; font-weight: 600; }
      .note { padding: 12px 14px; background: #f6f8fb; border-left: 4px solid #4f8ef7; line-height: 1.75; font-size: 13px; }
      ul { margin: 6px 0 0 18px; padding: 0; line-height: 1.8; font-size: 13px; }
      .muted { color: #708090; font-size: 12px; text-align: center; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(model.title)}</h1>
    <div class="muted">打印时间：${new Date().toLocaleString("zh-CN")}</div>
    ${bodyContent}
  </body>
</html>`;
}
