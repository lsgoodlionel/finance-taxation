import type { ServerResponse } from "node:http";
import { query, queryOne } from "../db/client.js";
import { redactSensitive } from "../security/redact.js";
import { GENESIS_HASH, hashRecord, verifyChain } from "../security/hash-chain.js";
import type { ChainedRecord } from "../security/hash-chain.js";
import type { ApiRequest } from "../types.js";
import { json } from "../utils/http.js";

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

/** Canonical shape hashed into the audit chain. Write path and verify path must build this identically. */
export interface AuditChainPayload {
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: Record<string, unknown> | null;
}

export function buildAuditPayload(input: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: Record<string, unknown> | null;
}): AuditChainPayload {
  return {
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    changes: input.changes ?? null
  };
}

/** Per-company serial queue so hash-chain appends never race on `prevHash`. */
const chainQueues = new Map<string, Promise<void>>();

async function appendAuditRecord(entry: AuditEntry): Promise<void> {
  const redactedChanges = entry.changes
    ? (redactSensitive(entry.changes) as Record<string, unknown>)
    : null;
  const payload = buildAuditPayload({
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    changes: redactedChanges
  });

  const prevRow = await queryOne<{ entry_hash: string | null }>(
    `select entry_hash from audit_logs
      where company_id = $1 and entry_hash is not null
      order by created_at desc
      limit 1`,
    [entry.companyId]
  );
  const prevHash = prevRow?.entry_hash ?? GENESIS_HASH;
  const entryHash = hashRecord(prevHash, payload);

  await query(
    `insert into audit_logs
      (company_id, user_id, user_name, action, resource_type, resource_id, resource_label, changes, prev_hash, entry_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.companyId,
      entry.userId ?? null,
      entry.userName ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.resourceLabel ?? null,
      redactedChanges ? JSON.stringify(redactedChanges) : null,
      prevHash,
      entryHash
    ]
  );
}

/** Fire-and-forget: audit failures must never crash business operations. */
export function writeAudit(entry: AuditEntry): void {
  const tail = chainQueues.get(entry.companyId) ?? Promise.resolve();
  const next = tail
    .catch(() => {
      // Previous append already failed and was reported; keep the queue alive.
    })
    .then(() => appendAuditRecord(entry))
    .catch(() => {
      // Audit failure must never crash business operations
    });
  chainQueues.set(entry.companyId, next);
}

/** Await all in-flight audit-chain appends (graceful shutdown / deterministic tests). */
export async function drainAuditQueues(): Promise<void> {
  await Promise.allSettled([...chainQueues.values()]);
}

interface AuditChainRow {
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Record<string, unknown> | null;
  prev_hash: string | null;
  entry_hash: string | null;
}

/**
 * GET /api/audit/verify-chain — rebuilds the hash chain for the caller's company
 * and reports whether it is intact. Rows written before this migration have no
 * `entry_hash` and are skipped as an unchained historical prefix.
 */
export async function verifyAuditChain(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;

  const rows = await query<AuditChainRow>(
    `select action, resource_type, resource_id, changes, prev_hash, entry_hash
       from audit_logs
      where company_id = $1
      order by created_at asc, id asc`,
    [companyId]
  );

  const chainedRows = rows.filter((row) => row.entry_hash !== null);
  const chain: ChainedRecord[] = chainedRows.map((row, index) => ({
    seq: index,
    payload: buildAuditPayload({
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      changes: row.changes
    }),
    prevHash: row.prev_hash ?? GENESIS_HASH,
    hash: row.entry_hash as string
  }));

  const result = verifyChain(chain);
  json(res, 200, { valid: result.valid, brokenAt: result.brokenAt, total: chain.length });
}
