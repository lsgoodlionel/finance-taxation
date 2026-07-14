/**
 * D6 开放能力 HTTP 路由：API Key 生成/列出/撤销 + Webhook 注册
 * POST /api/settings/api-keys              生成 API Key（明文仅此一次返回）
 * GET  /api/settings/api-keys              列出本公司 API Key（不含明文/哈希）
 * POST /api/settings/api-keys/:id/revoke   撤销 API Key
 * POST /api/settings/webhooks              注册 Webhook 端点（secret 仅此一次返回）
 *
 * 纯核心逻辑（key/secret 生成与哈希）复用 security/api-credentials.ts。
 */

import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { generateApiKey } from "../../security/api-credentials.js";
import type { RouteParams } from "../../router/router.js";

export async function createApiKey(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { name?: string };

  const { key, hash } = generateApiKey();
  const prefix = key.slice(0, 8);
  const id = randomUUID();

  await query(
    `insert into api_credentials (id, company_id, name, key_prefix, key_hash)
     values ($1, $2, $3, $4, $5)`,
    [id, cid, body.name ?? "", prefix, hash],
  );

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "open_api.key.created",
    resourceType: "api_credential", resourceId: id, changes: { name: body.name ?? "" } });
  json(res, 200, { ok: true, id, key, keyPrefix: prefix });
}

export async function listApiKeys(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const items = await query<{
    id: string; name: string; key_prefix: string; created_at: string; revoked_at: string | null;
  }>(
    `select id, name, key_prefix, created_at, revoked_at
     from api_credentials where company_id=$1 order by created_at desc`,
    [cid],
  );
  json(res, 200, {
    items: items.map((row) => ({
      id: row.id, name: row.name, keyPrefix: row.key_prefix,
      createdAt: row.created_at, revokedAt: row.revoked_at,
    })),
    total: items.length,
  });
}

export async function revokeApiKey(req: ApiRequest, res: ServerResponse, params: RouteParams): Promise<void> {
  const cid = req.auth!.companyId;
  const id = params.id;
  const result = await query(
    `update api_credentials set revoked_at=now()
     where id=$1 and company_id=$2 and revoked_at is null returning id`,
    [id, cid],
  );
  if (result.length === 0) { json(res, 404, { error: "API Key 不存在或已撤销" }); return; }

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "open_api.key.revoked",
    resourceType: "api_credential", resourceId: id });
  json(res, 200, { ok: true });
}

export async function registerWebhook(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as { event_type?: string; target_url?: string };
  if (!body.event_type || !body.target_url) {
    json(res, 400, { error: "event_type 与 target_url 为必填项" });
    return;
  }

  const secret = generateApiKey().key;
  const id = randomUUID();

  await query(
    `insert into webhook_endpoints (id, company_id, event_type, target_url, secret)
     values ($1, $2, $3, $4, $5)`,
    [id, cid, body.event_type, body.target_url, secret],
  );

  writeAudit({ companyId: cid, userId: req.auth!.userId, action: "open_api.webhook.registered",
    resourceType: "webhook_endpoint", resourceId: id, changes: { eventType: body.event_type, targetUrl: body.target_url } });
  json(res, 200, { ok: true, id, eventType: body.event_type, targetUrl: body.target_url, secret });
}
