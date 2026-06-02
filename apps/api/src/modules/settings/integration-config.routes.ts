/**
 * 外部系统对接配置 API
 *
 * GET  /api/settings/integrations              → 所有对接配置（脱敏）
 * GET  /api/settings/integrations/:type        → 单条配置
 * PUT  /api/settings/integrations/:type        → 创建或更新
 * POST /api/settings/integrations/:type/test   → 测试连接
 *
 * config_type:
 *   invoice_verify  → 发票验真服务商
 *   bank_api        → 银行直连（P5）
 *   si_api          → 社保申报API（P4+）
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { testInvoiceVerifyProvider } from "../invoices/invoice-verify.js";
import { BANK_API_PROVIDERS, testBankApiProvider } from "../banking/bank-api.js";

// ── 内置提供商信息 ─────────────────────────────────────────────────────────────

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresApiSecret: boolean;
  requiresAppId: boolean;
  requiresEndpoint: boolean;
  docsUrl: string;
  freeQuota: string;
}

export const INVOICE_VERIFY_PROVIDERS: ProviderMeta[] = [
  {
    id: "local",
    name: "本地规则（P1）",
    description: "基于格式规则的本地验证：发票号码8位、代码10/12位、日期合理性、金额范围、税号格式。无需配置，立即可用。",
    requiresApiKey: false,
    requiresApiSecret: false,
    requiresAppId: false,
    requiresEndpoint: false,
    docsUrl: "",
    freeQuota: "无限制",
  },
  {
    id: "etax_nsrsbh",
    name: "国家税务总局查验平台",
    description: "官方免费接口，通过发票代码+号码+金额+日期联合查验。需申请企业账户准入。部分地区有查验频率限制（每日100次/企业）。",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresAppId: false,
    requiresEndpoint: false,
    docsUrl: "https://www.chinatax.gov.cn/",
    freeQuota: "100次/天",
  },
  {
    id: "baiwang",
    name: "百望云",
    description: "国内主流增值税发票服务商，支持实时验真、OCR识别、发票归档。商业服务，按查验量计费，API文档完整。",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresAppId: true,
    requiresEndpoint: false,
    docsUrl: "https://developer.baiwang.com/",
    freeQuota: "试用500次",
  },
  {
    id: "nuonuo",
    name: "诺诺网",
    description: "增值税发票综合服务平台，支持开票、验真、查询、归档全流程。商业API，需签订服务协议。",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresAppId: false,
    requiresEndpoint: false,
    docsUrl: "https://open.nuonuo.com/",
    freeQuota: "试用100次",
  },
  {
    id: "custom",
    name: "自定义接口",
    description: "对接自建或其他第三方发票验真服务。接口需符合通用JSON规范：POST {invoiceCode, invoiceNo, invoiceDate, totalAmount} → {valid: bool, message: string}。",
    requiresApiKey: false,
    requiresApiSecret: false,
    requiresAppId: false,
    requiresEndpoint: true,
    docsUrl: "",
    freeQuota: "取决于对方服务",
  },
];

// ── 读取（脱敏）────────────────────────────────────────────────────────────────

function maskSecret(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 8) return "****";
  return s.slice(0, 4) + "****" + s.slice(-4);
}

interface IntegrationConfigRow {
  id: string;
  company_id: string;
  config_type: string;
  provider: string;
  api_key: string | null;
  api_secret: string | null;
  app_id: string | null;
  endpoint_url: string | null;
  extra_config: Record<string, string> | null;
  enabled: boolean;
  last_test_ok: boolean | null;
  last_test_at: string | null;
  last_test_msg: string | null;
  updated_at: string;
}

function rowToDto(row: IntegrationConfigRow, masked = true) {
  return {
    configType:   row.config_type,
    provider:     row.provider,
    apiKey:       masked ? maskSecret(row.api_key)    : row.api_key,
    apiSecret:    masked ? maskSecret(row.api_secret) : row.api_secret,
    appId:        masked ? maskSecret(row.app_id)     : row.app_id,
    endpointUrl:  row.endpoint_url,
    extraConfig:  row.extra_config ?? {},
    enabled:      row.enabled,
    lastTestOk:   row.last_test_ok,
    lastTestAt:   row.last_test_at,
    lastTestMsg:  row.last_test_msg,
    updatedAt:    row.updated_at,
  };
}

export async function listIntegrationConfigs(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;
  const rows = await query<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id = $1 ORDER BY config_type",
    [cid],
  );
  // Always include the invoice_verify entry (default to 'local' if not configured)
  const configMap = new Map(rows.map(r => [r.config_type, rowToDto(r)]));
  if (!configMap.has("invoice_verify")) {
    configMap.set("invoice_verify", {
      configType: "invoice_verify", provider: "local",
      apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
      extraConfig: {}, enabled: true,
      lastTestOk: null, lastTestAt: null, lastTestMsg: null, updatedAt: "",
    });
  }
  if (!configMap.has("bank_api")) {
    configMap.set("bank_api", {
      configType: "bank_api", provider: "manual",
      apiKey: null, apiSecret: null, appId: null, endpointUrl: null,
      extraConfig: {}, enabled: true,
      lastTestOk: null, lastTestAt: null, lastTestMsg: null, updatedAt: "",
    });
  }
  json(res, 200, {
    items: Array.from(configMap.values()),
    providers: { invoice_verify: INVOICE_VERIFY_PROVIDERS, bank_api: BANK_API_PROVIDERS },
  });
}

export async function getIntegrationConfig(
  req: ApiRequest, res: ServerResponse, configType: string,
): Promise<void> {
  const cid = req.auth!.companyId;
  const row = await queryOne<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id=$1 AND config_type=$2",
    [cid, configType],
  );
  const providers = configType === "invoice_verify" ? INVOICE_VERIFY_PROVIDERS
    : configType === "bank_api" ? BANK_API_PROVIDERS
    : [];
  const defaultProvider = configType === "bank_api" ? "manual" : "local";
  json(res, 200, {
    config: row ? rowToDto(row) : { configType, provider: defaultProvider, enabled: true },
    providers,
  });
}

// ── 更新 ──────────────────────────────────────────────────────────────────────

export async function upsertIntegrationConfig(
  req: ApiRequest, res: ServerResponse, configType: string,
): Promise<void> {
  const cid = req.auth!.companyId;
  const body = (req.body ?? {}) as {
    provider?: string;
    apiKey?: string;
    apiSecret?: string;
    appId?: string;
    endpointUrl?: string;
    extraConfig?: Record<string, string>;
    enabled?: boolean;
  };

  if (!body.provider) { json(res, 400, { error: "provider 为必填项" }); return; }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM integration_configs WHERE company_id=$1 AND config_type=$2", [cid, configType],
  );

  // 如果新值是 "不变占位符"（前端传来的 ****），保留旧值
  const keepIfMask = async (newVal: string | undefined, field: string): Promise<string | null> => {
    if (!newVal || newVal === "****" || newVal.includes("****")) {
      if (!existing) return null;
      const old = await queryOne<{ val: string | null }>(
        `SELECT ${field} as val FROM integration_configs WHERE company_id=$1 AND config_type=$2`,
        [cid, configType],
      );
      return old?.val ?? null;
    }
    return newVal;
  };

  const resolvedKey    = await keepIfMask(body.apiKey,    "api_key");
  const resolvedSecret = await keepIfMask(body.apiSecret, "api_secret");
  const resolvedAppId  = await keepIfMask(body.appId,     "app_id");

  if (existing) {
    await query(
      `UPDATE integration_configs SET
         provider=$1, api_key=$2, api_secret=$3, app_id=$4,
         endpoint_url=$5, extra_config=$6, enabled=$7,
         last_test_ok=null, last_test_at=null, last_test_msg=null,
         updated_at=now()
       WHERE company_id=$8 AND config_type=$9`,
      [body.provider, resolvedKey, resolvedSecret, resolvedAppId,
       body.endpointUrl ?? null, JSON.stringify(body.extraConfig ?? {}),
       body.enabled ?? true, cid, configType],
    );
  } else {
    const id = `ic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await query(
      `INSERT INTO integration_configs
         (id, company_id, config_type, provider, api_key, api_secret, app_id,
          endpoint_url, extra_config, enabled, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())`,
      [id, cid, configType, body.provider, resolvedKey, resolvedSecret, resolvedAppId,
       body.endpointUrl ?? null, JSON.stringify(body.extraConfig ?? {}), body.enabled ?? true],
    );
  }

  writeAudit({
    companyId: cid, action: `integration.${configType}.updated`,
    resourceType: "integration_config",
    changes: { provider: body.provider, enabled: body.enabled },
  });

  const updated = await queryOne<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id=$1 AND config_type=$2", [cid, configType],
  );
  json(res, 200, { ok: true, config: updated ? rowToDto(updated) : null });
}

// ── 测试连接 ──────────────────────────────────────────────────────────────────

export async function testIntegrationConfig(
  req: ApiRequest, res: ServerResponse, configType: string,
): Promise<void> {
  const cid = req.auth!.companyId;

  if (configType !== "invoice_verify" && configType !== "bank_api") {
    json(res, 400, { error: `${configType} 类型的测试暂未支持` }); return;
  }

  const row = await queryOne<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id=$1 AND config_type=$2",
    [cid, configType],
  );

  const defaultProvider = configType === "bank_api" ? "manual" : "local";
  const provider = row?.provider ?? defaultProvider;
  const result = configType === "bank_api"
    ? await testBankApiProvider({
        provider,
        apiKey:      row?.api_key      ?? null,
        apiSecret:   row?.api_secret   ?? null,
        appId:       row?.app_id       ?? null,
        endpointUrl: row?.endpoint_url ?? null,
        extraConfig: (row?.extra_config as Record<string, string>) ?? {},
      })
    : await testInvoiceVerifyProvider({
        provider,
        apiKey:      row?.api_key      ?? null,
        apiSecret:   row?.api_secret   ?? null,
        appId:       row?.app_id       ?? null,
        endpointUrl: row?.endpoint_url ?? null,
      });

  // 更新测试结果
  if (row) {
    await query(
      `UPDATE integration_configs SET last_test_ok=$1, last_test_at=now(), last_test_msg=$2
       WHERE company_id=$3 AND config_type=$4`,
      [result.ok, result.message, cid, configType],
    );
  }

  writeAudit({
    companyId: cid, action: `integration.${configType}.tested`,
    resourceType: "integration_config",
    changes: { provider, ok: result.ok },
  });

  json(res, 200, { ok: result.ok, message: result.message, provider });
}

// ── 读取配置（内部供 invoice-verify 调用）────────────────────────────────────

export async function loadInvoiceVerifyConfig(companyId: string): Promise<{
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig: Record<string, string>;
}> {
  const row = await queryOne<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id=$1 AND config_type='invoice_verify' AND enabled=true",
    [companyId],
  );
  return {
    provider:    row?.provider     ?? "local",
    apiKey:      row?.api_key      ?? null,
    apiSecret:   row?.api_secret   ?? null,
    appId:       row?.app_id       ?? null,
    endpointUrl: row?.endpoint_url ?? null,
    extraConfig: (row?.extra_config as Record<string, string>) ?? {},
  };
}

/** P5：读取银行 API 直连配置（内部供 bank-api 调用）。 */
export async function loadBankApiConfig(companyId: string): Promise<{
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig: Record<string, string>;
}> {
  const row = await queryOne<IntegrationConfigRow>(
    "SELECT * FROM integration_configs WHERE company_id=$1 AND config_type='bank_api' AND enabled=true",
    [companyId],
  );
  return {
    provider:    row?.provider     ?? "manual",
    apiKey:      row?.api_key      ?? null,
    apiSecret:   row?.api_secret   ?? null,
    appId:       row?.app_id       ?? null,
    endpointUrl: row?.endpoint_url ?? null,
    extraConfig: (row?.extra_config as Record<string, string>) ?? {},
  };
}
