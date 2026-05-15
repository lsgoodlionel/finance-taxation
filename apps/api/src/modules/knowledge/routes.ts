import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import { writeAudit } from "../../services/audit.js";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    category: row.category as string,
    title: row.title as string,
    content: row.content as string,
    tags: row.tags as string[],
    isActive: row.is_active as boolean,
    createdByUserId: row.created_by_user_id as string | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString()
  };
}

export async function listKnowledgeItems(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url || "/", "http://localhost");
  const category = url.searchParams.get("category") || "";
  const q = url.searchParams.get("q") || "";
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const conditions: string[] = ["company_id = $1"];
  const params: unknown[] = [companyId];
  let idx = 2;

  if (!includeInactive) {
    conditions.push("is_active = true");
  }
  if (category) {
    conditions.push(`category = $${idx++}`);
    params.push(category);
  }
  if (q) {
    conditions.push(`(title ilike $${idx} or content ilike $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }

  const rows = await query<Record<string, unknown>>(
    `select * from company_knowledge_items
     where ${conditions.join(" and ")}
     order by category, created_at desc`,
    params
  );

  const [countRow] = await query<{ total: string }>(
    `select count(*) as total from company_knowledge_items where company_id = $1 and is_active = true`,
    [companyId]
  );

  json(res, 200, { items: rows.map(mapRow), total: parseInt(countRow?.total ?? "0", 10) });
}

export async function createKnowledgeItem(req: ApiRequest, res: ServerResponse): Promise<void> {
  const companyId = req.auth!.companyId;
  const body = (req.body ?? {}) as {
    category?: string;
    title?: string;
    content?: string;
    tags?: string[];
  };

  if (!body.category || !body.title || !body.content) {
    json(res, 400, { error: "category、title、content 均为必填项" });
    return;
  }

  const validCategories = ["regulation", "policy", "faq", "template"];
  if (!validCategories.includes(body.category)) {
    json(res, 400, { error: `category 必须是 ${validCategories.join(" | ")} 之一` });
    return;
  }

  const [row] = await query<Record<string, unknown>>(
    `insert into company_knowledge_items
       (company_id, category, title, content, tags, created_by_user_id)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [companyId, body.category, body.title.trim(), body.content.trim(),
     body.tags ?? [], req.auth!.userId ?? null]
  );

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "create",
    resourceType: "knowledge_item",
    resourceId: (row as Record<string, unknown>).id as string,
    resourceLabel: body.title
  });

  json(res, 201, mapRow(row!));
}

export async function updateKnowledgeItem(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const companyId = req.auth!.companyId;
  const body = (req.body ?? {}) as Partial<{
    category: string;
    title: string;
    content: string;
    tags: string[];
    isActive: boolean;
  }>;

  const [existing] = await query<Record<string, unknown>>(
    "select * from company_knowledge_items where id = $1 and company_id = $2",
    [id, companyId]
  );
  if (!existing) {
    json(res, 404, { error: "知识库条目不存在" });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (body.category !== undefined) { sets.push(`category = $${idx++}`); params.push(body.category); }
  if (body.title !== undefined) { sets.push(`title = $${idx++}`); params.push(body.title.trim()); }
  if (body.content !== undefined) { sets.push(`content = $${idx++}`); params.push(body.content.trim()); }
  if (body.tags !== undefined) { sets.push(`tags = $${idx++}`); params.push(body.tags); }
  if (body.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(body.isActive); }

  if (sets.length === 0) {
    json(res, 200, mapRow(existing));
    return;
  }

  sets.push(`updated_at = now()`);
  params.push(id, companyId);

  const [updated] = await query<Record<string, unknown>>(
    `update company_knowledge_items set ${sets.join(", ")}
     where id = $${idx++} and company_id = $${idx} returning *`,
    params
  );

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "update",
    resourceType: "knowledge_item",
    resourceId: id,
    resourceLabel: (updated as Record<string, unknown>).title as string
  });

  json(res, 200, mapRow(updated!));
}

export async function deleteKnowledgeItem(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const companyId = req.auth!.companyId;

  const [existing] = await query<Record<string, unknown>>(
    "select id, title from company_knowledge_items where id = $1 and company_id = $2",
    [id, companyId]
  );
  if (!existing) {
    json(res, 404, { error: "知识库条目不存在" });
    return;
  }

  await query(
    "delete from company_knowledge_items where id = $1 and company_id = $2",
    [id, companyId]
  );

  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "delete",
    resourceType: "knowledge_item",
    resourceId: id,
    resourceLabel: existing.title as string
  });

  json(res, 200, { ok: true });
}

export async function searchKnowledgeForAi(
  companyId: string,
  userQuery: string
): Promise<string> {
  if (!userQuery.trim()) return "";

  const keywords = userQuery
    .replace(/[^一-龥\w\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 1)
    .slice(0, 3);

  if (keywords.length === 0) return "";

  const likeConditions = keywords
    .map((_, i) => `(title ilike $${i + 2} or content ilike $${i + 2} or tags::text ilike $${i + 2})`)
    .join(" or ");

  const rows = await query<{ category: string; title: string; content: string }>(
    `select category, title, content
     from company_knowledge_items
     where company_id = $1
       and is_active = true
       and (${likeConditions})
     order by category
     limit 5`,
    [companyId, ...keywords.map((k) => `%${k}%`)]
  );

  if (rows.length === 0) return "";

  const lines = rows
    .map((r) => `- [${categoryLabel(r.category)}] **${r.title}**\n  ${r.content.slice(0, 200)}${r.content.length > 200 ? "…" : ""}`)
    .join("\n");

  return `\n\n## 企业制度与财税口径参考（自动匹配，${rows.length} 条）\n${lines}`;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    regulation: "法规",
    policy: "制度",
    faq: "问答",
    template: "模板"
  };
  return map[cat] ?? cat;
}
