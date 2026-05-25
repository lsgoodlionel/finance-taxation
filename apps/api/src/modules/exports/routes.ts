import type { ServerResponse } from "node:http";
import type { ExportArchiveEntry, ExportArtifactKind, ExportJob, ExportJobStatus } from "@finance-taxation/domain-model";
import { query, withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { buildExportArchiveEntry, buildExportJob } from "./history.js";

interface ExportJobRow {
  id: string;
  company_id: string;
  kind: ExportArtifactKind;
  label: string;
  file_name: string;
  resource_type: string | null;
  resource_id: string | null;
  period_label: string | null;
  status: ExportJobStatus;
  created_by_user_id: string | null;
  created_by_name: string;
  created_at: string | Date;
}

interface ExportArchiveRow {
  id: string;
  company_id: string;
  job_id: string;
  archive_key: string;
  kind: ExportArtifactKind;
  title: string;
  file_name: string;
  object_type: string;
  object_id: string | null;
  period_label: string | null;
  created_at: string | Date;
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapJobRow(row: ExportJobRow): ExportJob {
  return {
    id: row.id,
    companyId: row.company_id,
    kind: row.kind,
    label: row.label,
    fileName: row.file_name,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    periodLabel: row.period_label,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: toIsoString(row.created_at)
  };
}

function mapArchiveRow(row: ExportArchiveRow): ExportArchiveEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    jobId: row.job_id,
    archiveKey: row.archive_key,
    kind: row.kind,
    title: row.title,
    fileName: row.file_name,
    objectType: row.object_type,
    objectId: row.object_id,
    periodLabel: row.period_label,
    createdAt: toIsoString(row.created_at)
  };
}

export async function listExportJobs(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url!, "http://x");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "20"), 1), 100);
  const status = url.searchParams.get("status");
  const rows = await query<ExportJobRow>(
    `select id, company_id, kind, label, file_name, resource_type, resource_id,
            period_label, status, created_by_user_id, created_by_name, created_at
     from export_jobs
     where company_id = $1
       and ($3::text is null or status = $3)
     order by created_at desc
     limit $2`,
    [req.auth!.companyId, limit, status]
  );

  return json(res, 200, {
    items: rows.map(mapJobRow),
    total: rows.length
  });
}

export async function listExportArchiveEntries(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url!, "http://x");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "20"), 1), 100);
  const kind = url.searchParams.get("kind");
  const keyword = url.searchParams.get("keyword");
  const rows = await query<ExportArchiveRow>(
    `select id, company_id, job_id, archive_key, kind, title, file_name,
            object_type, object_id, period_label, created_at
     from export_archive_entries
     where company_id = $1
       and ($3::text is null or kind = $3)
       and (
         $4::text is null
         or archive_key ilike $4
         or title ilike $4
         or file_name ilike $4
         or coalesce(object_type, '') ilike $4
         or coalesce(object_id, '') ilike $4
         or coalesce(period_label, '') ilike $4
       )
     order by created_at desc
     limit $2`,
    [req.auth!.companyId, limit, kind, keyword ? `%${keyword}%` : null]
  );

  return json(res, 200, {
    items: rows.map(mapArchiveRow),
    total: rows.length
  });
}

export async function createExportJob(req: ApiRequest, res: ServerResponse) {
  if (!req.auth) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const body = (req.body || {}) as {
    kind?: ExportArtifactKind;
    label?: string;
    fileName?: string;
    resourceType?: string | null;
    resourceId?: string | null;
    periodLabel?: string | null;
    status?: ExportJobStatus;
  };

  if (!body.kind || !body.label || !body.fileName) {
    return json(res, 400, { error: "kind、label、fileName 不能为空" });
  }

  const job = buildExportJob({
    companyId: req.auth.companyId,
    userId: req.auth.userId,
    userName: req.auth.username,
    kind: body.kind,
    label: body.label,
    fileName: body.fileName,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    periodLabel: body.periodLabel,
    status: body.status
  });

  const archiveEntry = buildExportArchiveEntry({
    companyId: req.auth.companyId,
    jobId: job.id,
    kind: body.kind,
    label: body.label,
    fileName: body.fileName,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    periodLabel: body.periodLabel
  });

  await withTransaction(async (client) => {
    await client.query(
      `insert into export_jobs (
        id, company_id, kind, label, file_name, resource_type, resource_id,
        period_label, status, created_by_user_id, created_by_name, created_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12::timestamptz
      )`,
      [
        job.id,
        job.companyId,
        job.kind,
        job.label,
        job.fileName,
        job.resourceType,
        job.resourceId,
        job.periodLabel,
        job.status,
        job.createdByUserId,
        job.createdByName,
        job.createdAt
      ]
    );

    await client.query(
      `insert into export_archive_entries (
        id, company_id, job_id, archive_key, kind, title, file_name,
        object_type, object_id, period_label, created_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11::timestamptz
      )`,
      [
        archiveEntry.id,
        archiveEntry.companyId,
        archiveEntry.jobId,
        archiveEntry.archiveKey,
        archiveEntry.kind,
        archiveEntry.title,
        archiveEntry.fileName,
        archiveEntry.objectType,
        archiveEntry.objectId,
        archiveEntry.periodLabel,
        archiveEntry.createdAt
      ]
    );
  });

  return json(res, 201, {
    job,
    archiveEntry
  });
}
