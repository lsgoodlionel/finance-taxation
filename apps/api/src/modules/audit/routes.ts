import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

interface AuditLogRow {
  id: string;
  company_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  changes: unknown;
  created_at: string | Date;
}

function mapRow(row: AuditLogRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    changes: row.changes ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export async function listAuditLogs(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url!, `http://x`);
  const companyId = req.auth!.companyId;

  const resourceType = url.searchParams.get("resourceType");
  const resourceId = url.searchParams.get("resourceId");
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limitParam = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(Math.max(limitParam, 1), 500);
  const offset = Math.max(offsetParam, 0);

  const conditions: string[] = ["company_id = $1"];
  const params: unknown[] = [companyId];
  let idx = 2;

  if (resourceType) {
    conditions.push(`resource_type = $${idx++}`);
    params.push(resourceType);
  }
  if (resourceId) {
    conditions.push(`resource_id = $${idx++}`);
    params.push(resourceId);
  }
  if (userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(userId);
  }
  if (from) {
    conditions.push(`created_at >= $${idx++}::timestamptz`);
    params.push(from);
  }
  if (to) {
    conditions.push(`created_at <= $${idx++}::timestamptz`);
    params.push(to);
  }

  const where = conditions.join(" and ");

  const [rows, countRows] = await Promise.all([
    query<AuditLogRow>(
      `select * from audit_logs where ${where} order by created_at desc limit $${idx} offset $${idx + 1}`,
      [...params, limit, offset]
    ),
    query<{ total: string }>(
      `select count(*)::int as total from audit_logs where ${where}`,
      params
    )
  ]);

  return json(res, 200, {
    items: rows.map(mapRow),
    total: Number(countRows[0]?.total ?? 0),
    limit,
    offset
  });
}
