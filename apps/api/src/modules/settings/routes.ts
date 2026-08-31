import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { AI_PROVIDERS, loadAiConfig, listOllamaModels } from "../../services/ai.js";
import type { ApiRequest } from "../../types.js";
import { permissionCatalog, type PermissionKey } from "@finance-taxation/domain-model";
import { hasPermission } from "../../middleware/auth.js";
import { toDateOnly } from "../../db/date-column.js";
import {
  buildTaxQualificationUpdate,
  isQualificationFieldError
} from "./tax-qualification-fields.js";

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
  employee_count: number | null;
  total_assets_cents: string | null;
  is_restricted_industry: boolean | null;
  high_tech_certificate_expires_on: string | Date | null;
  urban_construction_tax_zone: string | null;
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
    // 税收资格（V17 阶段三）。**保持 null**，不要 `?? 0` 或 `?? ""`——
    // null 是「没登记」，0 是「确实是 0」，判定层靠这个区别决定
    // 是报「优惠资格待确认」还是照常算税。
    employeeCount: r.employee_count ?? null,
    totalAssetsCents: r.total_assets_cents == null ? null : Number(r.total_assets_cents),
    isRestrictedIndustry: r.is_restricted_industry ?? false,
    highTechCertificateExpiresOn: toDateOnly(r.high_tech_certificate_expires_on ?? null),
    urbanConstructionTaxZone: r.urban_construction_tax_zone ?? null,
    updatedAt: r.updated_at
  };
}

const SELECT_COMPANY = `
  select id, name,
    registered_address, contact_email, contact_phone,
    credit_code, legal_representative, bank_name, bank_account,
    finance_approver_role,
    employee_count, total_assets_cents, is_restricted_industry,
    high_tech_certificate_expires_on, urban_construction_tax_zone,
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
  } & Record<string, unknown>;

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

  // 税收资格字段要归一化：空串必须落成 null 而不是 0，
  // 否则一家没登记的公司会被当成「0 人 0 资产」的小微企业按 5% 算税。
  const qualification = buildTaxQualificationUpdate(body);
  if (isQualificationFieldError(qualification)) {
    json(res, 400, { error: qualification.error, code: qualification.code });
    return;
  }
  for (const [column, value] of qualification.columns) {
    sets.push(`${column} = $${idx++}`);
    params.push(value);
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
               employee_count, total_assets_cents, is_restricted_industry,
               high_tech_certificate_expires_on, urban_construction_tax_zone,
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

/**
 * 公司成员列表。
 *
 * 支持 `?permission=ledger.post` 过滤出**持有某项权限**的人。
 *
 * 过滤放在服务端，是因为「哪个角色有哪项权限」的事实来源是
 * `middleware/auth.ts` 的权限表。前端要是自己按 roleId 判断，
 * 就等于把那张表复制一份——两份迟早会漂移，而漂移的方向通常是
 * 前端把不该出现的人列出来（比如让没有记账权的出纳去当过账终审人）。
 *
 * 典型用途：凭证过账要选终审人，只能从有 `ledger.post` 的人里选。
 */
export async function getUserList(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const requiredPermission = url.searchParams.get("permission");

  // 取角色**code** 而不是 role_id：权限表（middleware/auth.ts）按标准 code
  // 索引（role-accountant），而 user_roles 存的是公司自定义的 id
  // （role-v4-tech-accountant）。认证中间件走的也是 code——
  // 这里要是拿 id 去查权限，过滤结果永远是空的。
  const rows = await query<{
    id: string;
    username: string;
    display_name: string;
    role_ids: string[];
    role_codes: string[];
  }>(
    `select u.id, u.username, u.display_name,
            array_agg(ur.role_id) filter (where ur.role_id is not null) as role_ids,
            array_agg(r.code)     filter (where r.code   is not null) as role_codes
     from users u
     left join user_roles ur on ur.user_id = u.id
     left join roles r on r.id = ur.role_id
     where u.company_id = $1 and u.status = 'active'
     group by u.id, u.username, u.display_name
     order by u.display_name`,
    [req.auth!.companyId]
  );

  const items = rows
    .map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      roleIds: r.role_ids ?? [],
      roleCodes: r.role_codes ?? []
    }))
    .filter((item) => {
      if (!requiredPermission) return true;
      // 权限键不认识时**返回空而不是全部**——把所有人都列出来，
      // 调用方会以为「这些人都有这项权限」，那比列不出人危险得多。
      if (!(permissionCatalog as readonly string[]).includes(requiredPermission)) return false;
      return hasPermission(item.roleCodes, requiredPermission as PermissionKey);
    })
    // roleCodes 只用于服务端过滤，不外泄给调用方——响应形状保持不变。
    .map(({ roleCodes: _roleCodes, ...rest }) => rest);

  json(res, 200, { items, total: items.length });
}
