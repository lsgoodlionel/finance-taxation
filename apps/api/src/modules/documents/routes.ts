import type { ServerResponse } from "node:http";
import type {
  DocumentAttachmentRecord,
  GeneratedDocument
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { readJson, writeJson } from "../../services/jsonStore.js";
import { json } from "../../utils/http.js";
import { parseMultipart } from "../../utils/multipart.js";

const documentsFile = new URL("../../data/documents.v2.json", import.meta.url);
const documentAttachmentsFile = new URL("../../data/document-attachments.v2.json", import.meta.url);

const seedDocuments: GeneratedDocument[] = [];
const seedDocumentAttachments: DocumentAttachmentRecord[] = [];

function hasCompanyWideAccess(roleCodes: string[]) {
  return roleCodes.some((role) => ["role-chairman", "role-finance-director"].includes(role));
}

function scopeDocuments(rows: GeneratedDocument[], req: ApiRequest) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter((row) => row.ownerDepartment === req.auth!.departmentName);
}

export async function listDocuments(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(documentsFile, seedDocuments);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const scoped = scopeDocuments(rows, req);
  const filtered = eventId ? scoped.filter((item) => item.businessEventId === eventId) : scoped;
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function getDocumentDetail(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const attachments = await readJson(documentAttachmentsFile, seedDocumentAttachments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  return json(res, 200, {
    ...target,
    attachments: attachments.filter(
      (item) => item.documentId === target.id && item.companyId === req.auth!.companyId
    )
  });
}

export async function updateDocument(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const body = (req.body || {}) as Partial<GeneratedDocument>;
  const next = rows.map((item) => {
    if (item.id !== documentId) return item;
    return {
      ...item,
      status: body.status ?? item.status,
      title: body.title ?? item.title,
      ownerDepartment: body.ownerDepartment ?? item.ownerDepartment,
      updatedAt: new Date().toISOString()
    };
  });
  const updated = next.find((item) => item.id === documentId)!;
  await writeJson(documentsFile, next);
  return json(res, 200, updated);
}

export async function attachDocumentFile(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const attachments = await readJson(documentAttachmentsFile, seedDocumentAttachments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const body = (req.body || {}) as {
    attachmentId?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
  };
  if (!body.attachmentId) {
    return json(res, 400, { error: "attachmentId is required" });
  }
  const attachmentId = body.attachmentId;
  const now = new Date().toISOString();
  const attachment: DocumentAttachmentRecord = {
    id: attachmentId,
    companyId: req.auth!.companyId,
    documentId,
    fileName: body.fileName || attachmentId,
    fileType: body.fileType || "application/octet-stream",
    fileSize: body.fileSize || 0,
    uploadedAt: now
  };
  const next = rows.map((item) => {
    if (item.id !== documentId) return item;
    return {
      ...item,
      attachmentIds: item.attachmentIds.includes(attachmentId)
        ? item.attachmentIds
        : [...item.attachmentIds, attachmentId],
      status: item.status === "draft" ? "awaiting_upload" : item.status,
      updatedAt: now
    };
  });
  const updated = next.find((item) => item.id === documentId)!;
  await writeJson(documentsFile, next);
  const nextAttachments = attachments.some((item) => item.id === attachment.id)
    ? attachments
    : [attachment, ...attachments];
  await writeJson(documentAttachmentsFile, nextAttachments);
  return json(res, 200, {
    ...updated,
    attachments: nextAttachments.filter((item) => item.documentId === documentId)
  });
}

export async function archiveDocument(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const next = rows.map((item) => {
    if (item.id !== documentId) return item;
    return {
      ...item,
      status: "archived" as const,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
  const updated = next.find((item) => item.id === documentId)!;
  await writeJson(documentsFile, next);
  return json(res, 200, updated);
}

export async function uploadDocumentFile(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const attachments = await readJson(documentAttachmentsFile, seedDocumentAttachments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }

  let files;
  try {
    files = await parseMultipart(req);
  } catch {
    return json(res, 400, { error: "Failed to parse multipart upload" });
  }

  if (files.length === 0) {
    return json(res, 400, { error: "No file provided" });
  }

  const now = new Date().toISOString();
  const newAttachments: DocumentAttachmentRecord[] = files.map((f) => ({
    id: f.storageKey,
    companyId: req.auth!.companyId,
    documentId,
    fileName: f.fileName,
    fileType: f.mimeType,
    fileSize: f.size,
    uploadedAt: now
  }));

  const newIds = newAttachments.map((a) => a.id);
  const nextRows = rows.map((item) => {
    if (item.id !== documentId) return item;
    const merged = [...new Set([...item.attachmentIds, ...newIds])];
    return {
      ...item,
      attachmentIds: merged,
      status: item.status === "draft" ? ("awaiting_upload" as const) : item.status,
      updatedAt: now
    };
  });
  const updated = nextRows.find((item) => item.id === documentId)!;

  const existingIds = new Set(attachments.map((a) => a.id));
  const toAdd = newAttachments.filter((a) => !existingIds.has(a.id));
  const nextAttachments = [...toAdd, ...attachments];

  await writeJson(documentsFile, nextRows);
  await writeJson(documentAttachmentsFile, nextAttachments);

  return json(res, 200, {
    ...updated,
    attachments: nextAttachments.filter((a) => a.documentId === documentId)
  });
}

export async function listDocumentAttachments(req: ApiRequest, res: ServerResponse, documentId: string) {
  const rows = await readJson(documentsFile, seedDocuments);
  const attachments = await readJson(documentAttachmentsFile, seedDocumentAttachments);
  const target = scopeDocuments(rows, req).find((item) => item.id === documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const scoped = attachments.filter(
    (item) => item.documentId === documentId && item.companyId === req.auth!.companyId
  );
  return json(res, 200, { items: scoped, total: scoped.length });
}
