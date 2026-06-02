/**
 * P5 银行 API 直连连接器
 *
 * 配置驱动（integration_configs.config_type='bank_api'），支持：
 *   manual  手工模式（默认，不连 API，仍走 CSV 导入）
 *   cmb     招商银行企业银行 API
 *   ccb     中国建设银行企业 API
 *   custom  自定义 HTTP 接口（通用 JSON 规范）
 *
 * 能力：
 *   fetchStatements        拉取银行流水（替代手工 CSV 导入）
 *   submitPayrollTransfer  推送代发指令（替代手工上传代发文件）
 *
 * 与 P2 发票验真同构：真实服务商保留标准调用结构，未配置凭证时优雅报错。
 */

import type { ProviderMeta } from "../settings/integration-config.routes.js";

export interface BankApiConfig {
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig: Record<string, string>;
}

/** 标准化后的流水记录，对齐 bank_statements 插入结构。 */
export interface NormalizedStatement {
  transactionDate: string;   // YYYY-MM-DD
  valueDate: string | null;
  amount: number;            // 收入为正，支出为负
  balance: number | null;
  counterpartyName: string | null;
  counterpartyNo: string | null;
  transactionRef: string;    // 银行流水唯一号（去重键）
  description: string | null;
}

export interface FetchStatementsParams {
  accountNo?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchStatementsResult {
  ok: boolean;
  message: string;
  statements: NormalizedStatement[];
}

export interface SubmitTransferLine {
  accountNo: string;
  accountName: string;
  amount: number;
}

export interface SubmitTransferResult {
  ok: boolean;
  message: string;
  bankTransferRef: string | null;
}

// ── 服务商元数据 ──────────────────────────────────────────────────────────────

export const BANK_API_PROVIDERS: ProviderMeta[] = [
  {
    id: "manual",
    name: "手工模式（默认）",
    description: "不连接银行 API，继续使用 CSV 流水导入与手工上传代发文件。无需配置。",
    requiresApiKey: false, requiresApiSecret: false, requiresAppId: false, requiresEndpoint: false,
    docsUrl: "", freeQuota: "无限制",
  },
  {
    id: "cmb",
    name: "招商银行企业银行",
    description: "招行企业银行 CMB API，支持账户流水查询与批量代发。需企业网银证书与 API 准入。",
    requiresApiKey: true, requiresApiSecret: true, requiresAppId: true, requiresEndpoint: true,
    docsUrl: "https://open.cmbchina.com/", freeQuota: "按合约",
  },
  {
    id: "ccb",
    name: "中国建设银行",
    description: "建行企业银行开放平台，支持交易明细查询与代发代扣。需对公账户与开放平台签约。",
    requiresApiKey: true, requiresApiSecret: true, requiresAppId: true, requiresEndpoint: true,
    docsUrl: "https://open.ccb.com/", freeQuota: "按合约",
  },
  {
    id: "custom",
    name: "自定义接口",
    description: "对接自建或聚合代付服务。流水接口 POST {accountNo,dateFrom,dateTo}→{statements:[...]}；代发接口 POST {lines:[...]}→{ok,ref}。",
    requiresApiKey: false, requiresApiSecret: false, requiresAppId: false, requiresEndpoint: true,
    docsUrl: "", freeQuota: "取决于对方服务",
  },
];

// ── 标准化（纯函数，可测）──────────────────────────────────────────────────────

/** 把任意服务商返回的单条流水映射为标准结构，缺字段安全兜底。 */
export function normalizeApiStatement(raw: Record<string, unknown>): NormalizedStatement | null {
  const date = String(raw.transactionDate ?? raw.txnDate ?? raw.date ?? raw.jyrq ?? "").slice(0, 10);
  const ref = String(raw.transactionRef ?? raw.ref ?? raw.serialNo ?? raw.jydh ?? "").trim();
  if (!date || !ref) return null;

  const amountRaw = raw.amount ?? raw.txnAmount ?? raw.je ?? 0;
  const amount = typeof amountRaw === "number" ? amountRaw : parseFloat(String(amountRaw));
  if (!Number.isFinite(amount)) return null;

  const balanceRaw = raw.balance ?? raw.bal ?? raw.yue;
  const balance = balanceRaw === undefined || balanceRaw === null
    ? null
    : Number.isFinite(Number(balanceRaw)) ? Number(balanceRaw) : null;

  return {
    transactionDate: date,
    valueDate: raw.valueDate ? String(raw.valueDate).slice(0, 10) : null,
    amount,
    balance,
    counterpartyName: raw.counterpartyName ? String(raw.counterpartyName) : (raw.dfhm ? String(raw.dfhm) : null),
    counterpartyNo: raw.counterpartyNo ? String(raw.counterpartyNo) : (raw.dfzh ? String(raw.dfzh) : null),
    transactionRef: ref,
    description: raw.description ? String(raw.description) : (raw.zy ? String(raw.zy) : null),
  };
}

function normalizeMany(rawList: unknown): NormalizedStatement[] {
  if (!Array.isArray(rawList)) return [];
  const out: NormalizedStatement[] = [];
  for (const raw of rawList) {
    if (raw && typeof raw === "object") {
      const n = normalizeApiStatement(raw as Record<string, unknown>);
      if (n) out.push(n);
    }
  }
  return out;
}

// ── 拉取流水 ──────────────────────────────────────────────────────────────────

export async function fetchStatements(
  cfg: BankApiConfig,
  params: FetchStatementsParams,
): Promise<FetchStatementsResult> {
  switch (cfg.provider) {
    case "cmb":
    case "ccb":
    case "custom":
      return fetchViaHttp(cfg, params);
    default:
      return {
        ok: false,
        message: "当前为手工模式，请在「系统设置 → 外部对接」配置银行 API，或继续使用 CSV 导入。",
        statements: [],
      };
  }
}

async function fetchViaHttp(cfg: BankApiConfig, params: FetchStatementsParams): Promise<FetchStatementsResult> {
  if (!cfg.endpointUrl) {
    return { ok: false, message: "未配置银行 API 流水查询地址（endpointUrl）", statements: [] };
  }
  if ((cfg.provider === "cmb" || cfg.provider === "ccb") && (!cfg.apiKey || !cfg.apiSecret)) {
    return { ok: false, message: `未配置${cfg.provider === "cmb" ? "招行" : "建行"} API 凭证（apiKey/apiSecret）`, statements: [] };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
    if (cfg.apiSecret) headers["X-Api-Secret"] = cfg.apiSecret;
    if (cfg.appId) headers["X-App-Id"] = cfg.appId;

    const res = await fetch(cfg.endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        accountNo: params.accountNo ?? "",
        dateFrom: params.dateFrom ?? "",
        dateTo: params.dateTo ?? "",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, message: `银行 API 返回 HTTP ${res.status}`, statements: [] };
    }
    const data = await res.json() as { statements?: unknown; data?: { statements?: unknown } };
    const statements = normalizeMany(data.statements ?? data.data?.statements);
    return { ok: true, message: `已拉取 ${statements.length} 条流水`, statements };
  } catch (err) {
    return { ok: false, message: `连接银行 API 失败：${err instanceof Error ? err.message : "超时"}`, statements: [] };
  }
}

// ── 推送代发指令 ──────────────────────────────────────────────────────────────

export async function submitPayrollTransfer(
  cfg: BankApiConfig,
  payload: { period: string; lines: SubmitTransferLine[] },
): Promise<SubmitTransferResult> {
  if (cfg.provider === "manual") {
    return { ok: false, message: "当前为手工模式，请下载代发文件后在网银上传。", bankTransferRef: null };
  }
  if (!cfg.endpointUrl) {
    return { ok: false, message: "未配置银行 API 代发接口地址（endpointUrl）", bankTransferRef: null };
  }
  if ((cfg.provider === "cmb" || cfg.provider === "ccb") && (!cfg.apiKey || !cfg.apiSecret)) {
    return { ok: false, message: "未配置银行 API 凭证（apiKey/apiSecret）", bankTransferRef: null };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
    if (cfg.apiSecret) headers["X-Api-Secret"] = cfg.apiSecret;
    if (cfg.appId) headers["X-App-Id"] = cfg.appId;

    const res = await fetch(cfg.endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "payroll_transfer", period: payload.period, lines: payload.lines }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return { ok: false, message: `银行 API 返回 HTTP ${res.status}`, bankTransferRef: null };
    }
    const data = await res.json() as { ok?: boolean; success?: boolean; ref?: string; batchNo?: string; message?: string };
    const ok = data.ok ?? data.success ?? false;
    const ref = data.ref ?? data.batchNo ?? null;
    return { ok, message: data.message ?? (ok ? "代发指令已提交" : "银行拒绝代发指令"), bankTransferRef: ref };
  } catch (err) {
    return { ok: false, message: `连接银行 API 失败：${err instanceof Error ? err.message : "超时"}`, bankTransferRef: null };
  }
}

// ── 连接测试 ──────────────────────────────────────────────────────────────────

export async function testBankApiProvider(cfg: BankApiConfig): Promise<{ ok: boolean; message: string }> {
  if (cfg.provider === "manual") {
    return { ok: true, message: "手工模式无需测试连接，随时可用。" };
  }
  if (!cfg.endpointUrl) {
    return { ok: false, message: "请先填写 API Endpoint URL 再测试" };
  }
  if ((cfg.provider === "cmb" || cfg.provider === "ccb") && (!cfg.apiKey || !cfg.apiSecret)) {
    return { ok: false, message: "请先填写 API Key 和 Secret 再测试" };
  }
  const result = await fetchStatements(cfg, { dateFrom: "1970-01-01", dateTo: "1970-01-01" });
  return {
    ok: result.ok,
    message: result.ok ? `连接成功（${result.message}）` : `连接失败：${result.message}`,
  };
}
