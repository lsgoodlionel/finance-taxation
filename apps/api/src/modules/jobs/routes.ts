/**
 * F5 调度：任务队列的可观测与手动入队端点。
 * GET  /api/jobs        列出本公司最近的调度任务（状态/重试/下次执行）
 * POST /api/jobs        入队一个任务（kind 必须是已注册的处理器）
 */

import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { isKnownJobKind, JOB_HANDLERS } from "./handlers.js";

export async function listJobs(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const rows = await query(
    `select id, kind, status, run_at, attempts, max_attempts, recurring_interval_ms,
            last_error, last_run_at, created_at
       from scheduled_jobs
      where company_id = $1 or company_id is null
      order by created_at desc
      limit 100`,
    [cid]
  );
  json(res, 200, { items: rows, total: rows.length, knownKinds: Object.keys(JOB_HANDLERS) });
}

export async function enqueueJob(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as {
    kind?: string;
    runAt?: string;
    maxAttempts?: number;
    recurringIntervalMs?: number;
    payload?: Record<string, unknown>;
  };
  if (!body.kind || !isKnownJobKind(body.kind)) {
    json(res, 400, { error: `kind 必须是已注册的任务类型之一：${Object.keys(JOB_HANDLERS).join(", ")}` });
    return;
  }
  const id = randomUUID();
  await query(
    `insert into scheduled_jobs (id, company_id, kind, status, run_at, max_attempts, recurring_interval_ms, payload)
     values ($1, $2, $3, 'pending', coalesce($4, now()), coalesce($5, 5), $6, $7)`,
    [
      id,
      cid,
      body.kind,
      body.runAt ?? null,
      Number.isInteger(body.maxAttempts) ? body.maxAttempts : null,
      Number.isFinite(body.recurringIntervalMs) ? body.recurringIntervalMs : null,
      body.payload ? JSON.stringify(body.payload) : null
    ]
  );
  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "jobs.enqueued", resourceType: "scheduled_job", resourceId: id, changes: { kind: body.kind } });
  json(res, 200, { ok: true, id, kind: body.kind });
}
