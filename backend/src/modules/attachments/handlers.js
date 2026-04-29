import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { appConfig } from "../../config/app.js";
import { readRequestBody, sendBuffer, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";

const attachmentsFile = new URL("attachments.json", appConfig.dataDir);
const documentsFile = new URL("documents.json", appConfig.dataDir);
const storageDir = new URL("../storage/attachments/", appConfig.dataDir);

function sanitizeFilename(filename) {
  return (filename || "attachment.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}

const seedAttachments = [];

function normalizeDocument(row) {
  return {
    ...row,
    companyId: row.companyId || "demo-company",
    attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds : []
  };
}

export async function uploadAttachment(req, res) {
  const body = await readRequestBody(req);
  if (!body.filename || !body.contentBase64) {
    return sendJson(res, 400, { error: "filename and contentBase64 are required" });
  }

  const documents = (await readJson(documentsFile, [])).map(normalizeDocument);
  const document = body.documentId
    ? documents.find((item) => item.id === body.documentId && item.companyId === req.auth.companyId)
    : null;

  if (body.documentId && !document) {
    return sendJson(res, 404, { error: "Target document not found" });
  }

  const attachmentId = `att-${randomUUID()}`;
  const safeName = sanitizeFilename(body.filename);
  const fileName = `${attachmentId}-${safeName}`;
  const fileUrl = new URL(fileName, storageDir);
  const fileBuffer = Buffer.from(body.contentBase64, "base64");

  await mkdir(storageDir, { recursive: true });
  await writeFile(fileUrl, fileBuffer);

  const attachments = await readJson(attachmentsFile, seedAttachments);
  const nextAttachment = {
    id: attachmentId,
    companyId: req.auth.companyId,
    documentId: body.documentId || null,
    filename: body.filename,
    storedFilename: fileName,
    mimeType: body.mimeType || "application/octet-stream",
    size: fileBuffer.byteLength,
    uploadedBy: req.auth.userId,
    uploadedAt: new Date().toISOString(),
    downloadUrl: `/api/attachments/${attachmentId}/download`
  };

  attachments.unshift(nextAttachment);
  await writeJson(attachmentsFile, attachments);

  if (document) {
    const nextDocuments = documents.map((item) =>
      item.id === document.id
        ? { ...item, attachmentIds: Array.from(new Set([...(item.attachmentIds || []), attachmentId])) }
        : item
    );
    await writeJson(documentsFile, nextDocuments);
  }

  return sendJson(res, 201, nextAttachment);
}

export async function downloadAttachment(req, res, attachmentId) {
  const attachments = await readJson(attachmentsFile, seedAttachments);
  const attachment = attachments.find((item) => item.id === attachmentId && item.companyId === req.auth.companyId);
  if (!attachment) {
    return sendJson(res, 404, { error: "Attachment not found" });
  }
  const fileUrl = new URL(attachment.storedFilename, storageDir);
  const buffer = await readFile(fileUrl);
  return sendBuffer(res, 200, buffer, {
    "Content-Type": attachment.mimeType || "application/octet-stream",
    "Content-Length": buffer.byteLength,
    "Content-Disposition": `attachment; filename="${path.basename(attachment.filename)}"`
  });
}
