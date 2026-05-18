import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";

interface CompanyRow {
  id: string;
  name: string;
  registered_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  updated_at: string;
}

function rowToProfile(r: CompanyRow) {
  return {
    id: r.id,
    name: r.name,
    registeredAddress: r.registered_address ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    updatedAt: r.updated_at
  };
}

export async function getCompanySettings(req: ApiRequest, res: ServerResponse): Promise<void> {
  const row = await queryOne<CompanyRow>(
    `select id, name,
            registered_address, contact_email, contact_phone,
            updated_at::text
     from companies where id = $1`,
    [req.auth!.companyId]
  );
  if (!row) {
    json(res, 404, { error: "Company not found" });
    return;
  }
  json(res, 200, rowToProfile(row));
}

export async function updateCompanySettings(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as {
    name?: string;
    registeredAddress?: string;
    contactEmail?: string;
    contactPhone?: string;
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
  if (body.registeredAddress !== undefined) { sets.push(`registered_address = $${idx++}`); params.push(body.registeredAddress); }
  if (body.contactEmail !== undefined) { sets.push(`contact_email = $${idx++}`); params.push(body.contactEmail); }
  if (body.contactPhone !== undefined) { sets.push(`contact_phone = $${idx++}`); params.push(body.contactPhone); }

  if (sets.length === 0) {
    json(res, 400, { error: "没有要更新的字段" });
    return;
  }

  sets.push(`updated_at = now()`);
  params.push(req.auth!.companyId);

  const updated = await queryOne<CompanyRow>(
    `update companies set ${sets.join(", ")} where id = $${idx}
     returning id, name, registered_address, contact_email, contact_phone, updated_at::text`,
    params
  );

  if (!updated) {
    json(res, 404, { error: "Company not found" });
    return;
  }

  json(res, 200, rowToProfile(updated));
}

export async function getAiSettings(_req: ApiRequest, res: ServerResponse): Promise<void> {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const ollamaBase = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "gemma4:latest";
  json(res, 200, {
    provider: hasAnthropic ? "anthropic" : "ollama",
    anthropicConfigured: hasAnthropic,
    ollamaBaseUrl: ollamaBase,
    ollamaModel,
    note: hasAnthropic
      ? "当前使用 Anthropic Claude 作为 AI 后端（优先级更高）"
      : "当前使用本地 Ollama 作为 AI 后端（ANTHROPIC_API_KEY 未配置）"
  });
}

export async function getUserList(req: ApiRequest, res: ServerResponse): Promise<void> {
  const rows = await query<{ id: string; username: string; display_name: string; role_ids: string[] }>(
    `select u.id, u.username, u.display_name,
            array_agg(ur.role_id) filter (where ur.role_id is not null) as role_ids
     from users u
     left join user_roles ur on ur.user_id = u.id
     where u.company_id = $1
     group by u.id, u.username, u.display_name
     order by u.display_name`,
    [req.auth!.companyId]
  );
  json(res, 200, {
    items: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      roleIds: r.role_ids ?? []
    })),
    total: rows.length
  });
}
