import type { ServerResponse } from "node:http";
import type { ExportArchiveEntry, ExportArtifactKind, ExportJob, ExportJobStatus } from "@finance-taxation/domain-model";
import { query, withTransaction } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import {
  buildExportArchiveEntry,
  buildExportJob,
  buildExportReuseKey,
  canTransitionExportJobStatus,
  getExportJobAuditAction,
  markExportJobStatus
} from "./history.js";

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
  retry_count: number;
  last_error: string | null;
  last_attempt_at: string | Date | null;
  next_retry_at: string | Date | null;
  completed_at: string | Date | null;
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

function toOptionalIsoString(value: string | Date | null) {
  if (!value) {
    return null;
  }
  return toIsoString(value);
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
    retryCount: row.retry_count,
    lastError: row.last_error,
    lastAttemptAt: toOptionalIsoString(row.last_attempt_at),
    nextRetryAt: toOptionalIsoString(row.next_retry_at),
    completedAt: toOptionalIsoString(row.completed_at),
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: toIsoString(row.created_at)
  };
}

function buildNextRetryAt(delayMinutes = 15) {
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
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
            period_label, status, retry_count, last_error, last_attempt_at, next_retry_at, completed_at,
            created_by_user_id, created_by_name, created_at
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
  const auth = req.auth;

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
    userId: auth.userId,
    userName: auth.username,
    kind: body.kind,
    label: body.label,
    fileName: body.fileName,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    periodLabel: body.periodLabel,
    status: body.status
  });

  const archiveEntry = buildExportArchiveEntry({
    companyId: auth.companyId,
    jobId: job.id,
    kind: body.kind,
    label: body.label,
    fileName: body.fileName,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    periodLabel: body.periodLabel
  });
  const reuseKey = buildExportReuseKey({
    kind: body.kind,
    resourceType: body.resourceType,
    resourceId: body.resourceId,
    periodLabel: body.periodLabel,
    fileName: body.fileName
  });

  const outcome = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [reuseKey]);

    const existingRows = await client.query<ExportJobRow>(
      `select id, company_id, kind, label, file_name, resource_type, resource_id,
              period_label, status, retry_count, last_error, last_attempt_at, next_retry_at, completed_at,
              created_by_user_id, created_by_name, created_at
       from export_jobs
       where company_id = $1
         and kind = $2
         and coalesce(resource_type, '') = coalesce($3, '')
         and coalesce(resource_id, '') = coalesce($4, '')
         and coalesce(period_label, '') = coalesce($5, '')
         and file_name = $6
         and status in ('created', 'opened')
       order by created_at desc
       limit 1`,
      [
        auth.companyId,
        body.kind,
        body.resourceType ?? null,
        body.resourceId ?? null,
        body.periodLabel ?? null,
        body.fileName
      ]
    );

    const existingJob = existingRows.rows[0];
    if (existingJob) {
      const archiveRows = await client.query<ExportArchiveRow>(
        `select id, company_id, job_id, archive_key, kind, title, file_name,
                object_type, object_id, period_label, created_at
         from export_archive_entries
         where job_id = $1
         order by created_at desc
         limit 1`,
        [existingJob.id]
      );
      const reusedJob = mapJobRow(existingJob);
      const reusedArchiveEntry = archiveRows.rows[0]
        ? mapArchiveRow(archiveRows.rows[0])
        : buildExportArchiveEntry({
            companyId: reusedJob.companyId,
            jobId: reusedJob.id,
            kind: reusedJob.kind,
            label: reusedJob.label,
            fileName: reusedJob.fileName,
            resourceType: reusedJob.resourceType,
            resourceId: reusedJob.resourceId,
            periodLabel: reusedJob.periodLabel
          });
      return { statusCode: 200, job: reusedJob, archiveEntry: reusedArchiveEntry, reused: true };
    }

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

    return { statusCode: 201, job, archiveEntry, reused: false };
  });

  writeAudit({
    companyId: auth.companyId,
    userId: auth.userId,
    userName: auth.username,
    action: outcome.reused ? "reuse" : "create",
    resourceType: "export_job",
    resourceId: outcome.job.id,
    resourceLabel: outcome.job.label,
    changes: outcome.reused
      ? { reuseKey, status: outcome.job.status }
      : { data: { kind: outcome.job.kind, status: outcome.job.status, fileName: outcome.job.fileName } }
  });

  return json(res, outcome.statusCode, {
    job: outcome.job,
    archiveEntry: outcome.archiveEntry,
    reused: outcome.reused
  });
}

export async function updateExportJobStatus(req: ApiRequest, res: ServerResponse, jobId: string) {
  if (!req.auth) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const body = (req.body || {}) as {
    status?: ExportJobStatus;
    errorMessage?: string;
    nextRetryAt?: string | null;
  };
  if (!body.status || !["opened", "completed", "failed"].includes(body.status)) {
    return json(res, 400, { error: "status 必须为 opened/completed/failed" });
  }

  const rows = await query<ExportJobRow>(
    `select id, company_id, kind, label, file_name, resource_type, resource_id,
            period_label, status, retry_count, last_error, last_attempt_at, next_retry_at, completed_at,
            created_by_user_id, created_by_name, created_at
     from export_jobs
     where id = $1 and company_id = $2`,
    [jobId, req.auth.companyId]
  );
  const current = rows[0];
  if (!current) {
    return json(res, 404, { error: "导出任务不存在" });
  }
  if (!canTransitionExportJobStatus(current.status, body.status)) {
    return json(res, 400, { error: `不允许从 ${current.status} 变更到 ${body.status}` });
  }

  const updated = markExportJobStatus(mapJobRow(current), body.status);
  const now = new Date().toISOString();
  let retryCount = current.retry_count;
  let lastError = current.last_error;
  let lastAttemptAt: string | null = current.last_attempt_at ? toIsoString(current.last_attempt_at) : null;
  let nextRetryAt = current.next_retry_at ? toIsoString(current.next_retry_at) : null;
  let completedAt = current.completed_at ? toIsoString(current.completed_at) : null;

  if (body.status === "failed") {
    lastError = body.errorMessage?.trim() || "导出链路失败，请检查文件生成或外部连接器状态。";
    lastAttemptAt = now;
    nextRetryAt = body.nextRetryAt ?? buildNextRetryAt();
    completedAt = null;
  } else if (body.status === "opened") {
    if (current.status === "failed" || current.status === "completed") {
      retryCount += 1;
    }
    lastError = null;
    lastAttemptAt = now;
    nextRetryAt = null;
    completedAt = null;
  } else if (body.status === "completed") {
    lastError = null;
    lastAttemptAt = now;
    nextRetryAt = null;
    completedAt = now;
  }

  await query(
    `update export_jobs
     set status = $3,
         retry_count = $4,
         last_error = $5,
         last_attempt_at = $6::timestamptz,
         next_retry_at = $7::timestamptz,
         completed_at = $8::timestamptz
     where id = $1 and company_id = $2`,
    [jobId, req.auth.companyId, updated.status, retryCount, lastError, lastAttemptAt, nextRetryAt, completedAt]
  );

  writeAudit({
    companyId: req.auth.companyId,
    userId: req.auth.userId,
    userName: req.auth.username,
    action: getExportJobAuditAction(current.status, updated.status),
    resourceType: "export_job",
    resourceId: updated.id,
    resourceLabel: updated.label,
    changes: {
      status: { from: current.status, to: updated.status },
      retryCount,
      lastError,
      nextRetryAt
    }
  });

  return json(res, 200, {
    job: {
      ...updated,
      retryCount,
      lastError,
      lastAttemptAt,
      nextRetryAt,
      completedAt
    }
  });
}
