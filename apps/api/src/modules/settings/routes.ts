import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { AI_PROVIDERS, loadAiConfig, listOllamaModels } from "../../services/ai.js";
import type { ApiRequest } from "../../types.js";

interface CompanyRow {
  id: string;
  name: string;
  registered_address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  credit_code: string | null;
  legal_representative: string | null;
  bank_name: string | null;
  bank_account: string | null;
  finance_approver_role: string;
  updated_at: string;
}

function rowToProfile(r: CompanyRow) {
  return {
    id: r.id,
    name: r.name,
    registeredAddress: r.registered_address ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    creditCode: r.credit_code ?? "",
    legalRepresentative: r.legal_representative ?? "",
    bankName: r.bank_name ?? "",
    bankAccount: r.bank_account ?? "",
    financeApproverRole: r.finance_approver_role ?? "role-chairman",
    updatedAt: r.updated_at
  };
}

const SELECT_COMPANY = `
  select id, name,
    registered_address, contact_email, contact_phone,
    credit_code, legal_representative, bank_name, bank_account,
    finance_approver_role,
    updated_at::text
  from companies where id = $1
`;

export async function getCompanySettings(req: ApiRequest, res: ServerResponse): Promise<void> {
  const row = await queryOne<CompanyRow>(SELECT_COMPANY, [req.auth!.companyId]);
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
    creditCode?: string;
    legalRepresentative?: string;
    bankName?: string;
    bankAccount?: string;
    financeApproverRole?: string;
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fieldMap: [keyof typeof body, string][] = [
    ["name", "name"],
    ["registeredAddress", "registered_address"],
    ["contactEmail", "contact_email"],
    ["contactPhone", "contact_phone"],
    ["creditCode", "credit_code"],
    ["legalRepresentative", "legal_representative"],
    ["bankName", "bank_name"],
    ["bankAccount", "bank_account"],
    ["financeApproverRole", "finance_approver_role"]
  ];

  for (const [jsKey, dbCol] of fieldMap) {
    if (body[jsKey] !== undefined) {
      sets.push(`${dbCol} = $${idx++}`);
      params.push(body[jsKey]);
    }
  }

  if (sets.length === 0) {
    json(res, 400, { error: "没有要更新的字段" });
    return;
  }

  sets.push(`updated_at = now()`);
  params.push(req.auth!.companyId);

  const updated = await queryOne<CompanyRow>(
    `update companies set ${sets.join(", ")} where id = $${idx}
     returning id, name, registered_address, contact_email, contact_phone,
               credit_code, legal_representative, bank_name, bank_account,
               finance_approver_role,
               updated_at::text`,
    params
  );

  if (!updated) {
    json(res, 404, { error: "Company not found" });
    return;
  }

  json(res, 200, rowToProfile(updated));
}

export async function getAiSettings(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cfg = await loadAiConfig(req.auth!.companyId);
  json(res, 200, {
    provider: cfg.provider,
    model: cfg.model,
    apiKeyConfigured: Boolean(cfg.apiKey),
    apiKeyMasked: cfg.apiKey ? `${cfg.apiKey.slice(0, 6)}${"*".repeat(Math.max(0, cfg.apiKey.length - 10))}${cfg.apiKey.slice(-4)}` : null,
    baseUrl: cfg.baseUrl,
    extraConfig: cfg.extraConfig,
    providers: AI_PROVIDERS
  });
}

export async function updateAiSettings(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    extraConfig?: Record<string, string>;
  };

  if (!body.provider) {
    json(res, 400, { error: "provider 不能为空" });
    return;
  }

  const now = new Date().toISOString();
  const existingRow = await queryOne<{ id: string }>(
    "select id from ai_configs where company_id = $1",
    [req.auth!.companyId]
  );

  if (existingRow) {
    const sets: string[] = ["provider = $1", "model = $2", "updated_at = $3"];
    const params: unknown[] = [body.provider, body.model ?? "", now];
    let idx = 4;

    if (body.apiKey !== undefined && body.apiKey !== "") {
      sets.push(`api_key = $${idx++}`);
      params.push(body.apiKey);
    }
    if (body.baseUrl !== undefined) {
      sets.push(`base_url = $${idx++}`);
      params.push(body.baseUrl || null);
    }
    if (body.extraConfig !== undefined) {
      sets.push(`extra_config = $${idx++}`);
      params.push(JSON.stringify(body.extraConfig));
    }
    params.push(req.auth!.companyId);
    await queryOne(
      `update ai_configs set ${sets.join(", ")} where company_id = $${idx} returning id`,
      params
    );
  } else {
    await queryOne(
      `insert into ai_configs (company_id, provider, model, api_key, base_url, extra_config, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        req.auth!.companyId,
        body.provider,
        body.model ?? "",
        body.apiKey || null,
        body.baseUrl || null,
        body.extraConfig ? JSON.stringify(body.extraConfig) : null,
        now
      ]
    );
  }

  const cfg = await loadAiConfig(req.auth!.companyId);
  json(res, 200, {
    provider: cfg.provider,
    model: cfg.model,
    apiKeyConfigured: Boolean(cfg.apiKey),
    baseUrl: cfg.baseUrl,
    extraConfig: cfg.extraConfig
  });
}

export async function getOllamaModels(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const baseUrl = url.searchParams.get("baseUrl") || "http://localhost:11434";
  try {
    const models = await listOllamaModels(baseUrl);
    json(res, 200, { models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "连接 Ollama 失败";
    json(res, 502, { error: msg });
  }
}

export async function testAiConnection(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  if (!body.provider) {
    json(res, 400, { error: "provider 不能为空" });
    return;
  }

  try {
    if (body.provider === "ollama") {
      const base = body.baseUrl || "http://localhost:11434";
      const models = await listOllamaModels(base);
      json(res, 200, { ok: true, note: `Ollama 连接成功，已安装 ${models.length} 个模型` });
      return;
    }

    if (body.provider === "anthropic") {
      if (!body.apiKey) {
        json(res, 400, { error: "需要 API Key" });
        return;
      }
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: body.apiKey });
      const msg = await client.messages.create({
        model: body.model || "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
      });
      json(res, 200, { ok: true, note: `连接成功，model=${msg.model}` });
      return;
    }

    // OpenAI-compatible
    if (!body.apiKey) {
      json(res, 400, { error: "需要 API Key" });
      return;
    }
    const { AI_PROVIDERS: providers } = await import("../../services/ai.js");
    const providerInfo = providers.find((p) => p.id === body.provider);
    const base = body.baseUrl || providerInfo?.defaultBaseUrl || "";
    const url2 = `${base.replace(/\/$/, "")}/chat/completions`;
    const resp = await fetch(url2, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.apiKey}` },
      body: JSON.stringify({
        model: body.model,
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      json(res, 502, { error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
      return;
    }
    json(res, 200, { ok: true, note: `${body.provider} 连接成功` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "连接失败";
    json(res, 502, { error: msg });
  }
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
