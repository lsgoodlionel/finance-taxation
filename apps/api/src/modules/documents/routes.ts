import type { ServerResponse } from "node:http";
import type {
  DocumentAttachmentRecord,
  GeneratedDocument
} from "@finance-taxation/domain-model";
import { query, queryOne } from "../../db/client.js";
import { parseMultipart } from "../../utils/multipart.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

interface GeneratedDocumentRow {
  id: string;
  company_id: string;
  business_event_id: string;
  mapping_id: string;
  document_type: string;
  title: string;
  owner_department: string;
  status: GeneratedDocument["status"];
  source: GeneratedDocument["source"];
  archived_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface AttachmentRow {
  id: string;
  company_id: string;
  document_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_key: string | null;
  uploaded_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hasCompanyWideAccess(roleCodes: string[]) {
  return roleCodes.some((role) => ["role-chairman", "role-finance-director"].includes(role));
}

function mapAttachmentRow(row: AttachmentRow): DocumentAttachmentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    documentId: row.document_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedAt: toIsoString(row.uploaded_at) || new Date().toISOString()
  };
}

function mapDocumentRow(
  row: GeneratedDocumentRow,
  attachments: DocumentAttachmentRecord[]
): GeneratedDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    mappingId: row.mapping_id,
    documentType: row.document_type,
    title: row.title,
    ownerDepartment: row.owner_department,
    status: row.status,
    attachmentIds: attachments.filter((item) => item.documentId === row.id).map((item) => item.id),
    archivedAt: toIsoString(row.archived_at),
    source: row.source,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

export async function listCompanyDocumentAttachments(
  companyId: string,
  documentId?: string
): Promise<DocumentAttachmentRecord[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (documentId) {
    params.push(documentId);
    where += ` and document_id = $${params.length}`;
  }
  const rows = await query<AttachmentRow>(
    `
      select
        id, company_id, document_id, file_name, file_type, file_size, storage_key, uploaded_at
      from document_attachment_records
      ${where}
      order by uploaded_at desc
    `,
    params
  );
  return rows.map(mapAttachmentRow);
}

export async function listCompanyDocuments(
  companyId: string,
  options: { businessEventId?: string; documentId?: string } = {}
): Promise<GeneratedDocument[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  if (options.documentId) {
    params.push(options.documentId);
    where += ` and id = $${params.length}`;
  }
  const rows = await query<GeneratedDocumentRow>(
    `
      select
        id, company_id, business_event_id, mapping_id, document_type, title,
        owner_department, status, source, archived_at, created_at, updated_at
      from generated_documents
      ${where}
      order by created_at desc
    `,
    params
  );
  if (!rows.length) {
    return [];
  }
  const attachments = await listCompanyDocumentAttachments(companyId);
  return rows.map((row) => mapDocumentRow(row, attachments));
}

function scopeDocuments(rows: GeneratedDocument[], req: ApiRequest) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter((row) => row.ownerDepartment === req.auth!.departmentName);
}

async function getScopedDocument(req: ApiRequest, documentId: string): Promise<GeneratedDocument | null> {
  const rows = await listCompanyDocuments(req.auth!.companyId, { documentId });
  return scopeDocuments(rows, req)[0] ?? null;
}

export async function listDocuments(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyDocuments(req.auth!.companyId, { businessEventId: eventId });
  const filtered = scopeDocuments(rows, req);
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function getDocumentDetail(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const attachments = await listCompanyDocumentAttachments(req.auth!.companyId, target.id);
  return json(res, 200, {
    ...target,
    attachments
  });
}

export async function updateDocument(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const body = (req.body || {}) as Partial<GeneratedDocument>;
  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update generated_documents
      set
        status = $1,
        title = $2,
        owner_department = $3,
        updated_at = $4::timestamptz
      where id = $5 and company_id = $6
      returning id
    `,
    [
      body.status ?? target.status,
      body.title ?? target.title,
      body.ownerDepartment ?? target.ownerDepartment,
      updatedAt,
      documentId,
      req.auth!.companyId
    ]
  );
  const updated = await getScopedDocument(req, documentId);
  return json(res, 200, updated);
}

export async function attachDocumentFile(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
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
  const now = new Date().toISOString();
  await queryOne(
    `
      insert into document_attachment_records (
        id,
        company_id,
        document_id,
        file_name,
        file_type,
        file_size,
        storage_key,
        uploaded_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
      on conflict (id) do update set
        file_name = excluded.file_name,
        file_type = excluded.file_type,
        file_size = excluded.file_size,
        storage_key = excluded.storage_key,
        uploaded_at = excluded.uploaded_at
      returning id
    `,
    [
      body.attachmentId,
      req.auth!.companyId,
      documentId,
      body.fileName || body.attachmentId,
      body.fileType || "application/octet-stream",
      body.fileSize || 0,
      body.attachmentId,
      now
    ]
  );
  await queryOne(
    `
      update generated_documents
      set
        status = case when status = 'draft' then 'awaiting_upload' else status end,
        updated_at = $1::timestamptz
      where id = $2 and company_id = $3
      returning id
    `,
    [now, documentId, req.auth!.companyId]
  );
  const updated = await getScopedDocument(req, documentId);
  const attachments = await listCompanyDocumentAttachments(req.auth!.companyId, documentId);
  return json(res, 200, {
    ...updated,
    attachments
  });
}

export async function archiveDocument(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const now = new Date().toISOString();
  await queryOne(
    `
      update generated_documents
      set
        status = 'archived',
        archived_at = $1::timestamptz,
        updated_at = $1::timestamptz
      where id = $2 and company_id = $3
      returning id
    `,
    [now, documentId, req.auth!.companyId]
  );
  const updated = await getScopedDocument(req, documentId);
  return json(res, 200, updated);
}

export async function uploadDocumentFile(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
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
  for (const file of files) {
    await queryOne(
      `
        insert into document_attachment_records (
          id,
          company_id,
          document_id,
          file_name,
          file_type,
          file_size,
          storage_key,
          uploaded_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
        on conflict (id) do update set
          file_name = excluded.file_name,
          file_type = excluded.file_type,
          file_size = excluded.file_size,
          storage_key = excluded.storage_key,
          uploaded_at = excluded.uploaded_at
        returning id
      `,
      [
        file.storageKey,
        req.auth!.companyId,
        documentId,
        file.fileName,
        file.mimeType,
        file.size,
        file.storageKey,
        now
      ]
    );
  }

  await queryOne(
    `
      update generated_documents
      set
        status = case when status = 'draft' then 'awaiting_upload' else status end,
        updated_at = $1::timestamptz
      where id = $2 and company_id = $3
      returning id
    `,
    [now, documentId, req.auth!.companyId]
  );

  const updated = await getScopedDocument(req, documentId);
  const attachments = await listCompanyDocumentAttachments(req.auth!.companyId, documentId);
  return json(res, 200, {
    ...updated,
    attachments
  });
}

export async function listDocumentAttachments(req: ApiRequest, res: ServerResponse, documentId: string) {
  const target = await getScopedDocument(req, documentId);
  if (!target) {
    return json(res, 404, { error: "Document not found" });
  }
  const items = await listCompanyDocumentAttachments(req.auth!.companyId, documentId);
  return json(res, 200, { items, total: items.length });
}
