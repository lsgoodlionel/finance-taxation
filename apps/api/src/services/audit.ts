import { query } from "../db/client.js";

export interface AuditEntry {
  companyId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  changes?: Record<string, unknown> | null;
}

export function writeAudit(entry: AuditEntry): void {
  query(
    `insert into audit_logs
      (company_id, user_id, user_name, action, resource_type, resource_id, resource_label, changes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.companyId,
      entry.userId ?? null,
      entry.userName ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.resourceLabel ?? null,
      entry.changes ? JSON.stringify(entry.changes) : null
    ]
  ).catch(() => {
    // Audit failure must never crash business operations
  });
}
