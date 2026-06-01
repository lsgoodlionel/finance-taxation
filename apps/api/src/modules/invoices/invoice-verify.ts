/**
 * 发票验真模块（P1 → P2 升级）
 *
 * P1：本地规则验证（格式校验）
 * P2：读取 integration_configs 表中配置的服务商，调用真实 API
 *
 * 支持服务商：
 *   local          本地规则（默认，P1）
 *   etax_nsrsbh    国家税务总局查验平台（官方免费）
 *   baiwang        百望云（商业）
 *   nuonuo         诺诺网（商业）
 *   custom         自定义 HTTP POST 接口
 *
 * 升级方法：
 *   只需在「系统设置 → 外部对接」中选择服务商并填写 API Key，
 *   无需修改任何业务代码，verifyInvoice() 自动使用配置的服务商。
 */

import { loadAiConfig } from "../../services/ai.js";
import Anthropic from "@anthropic-ai/sdk";

export interface InvoiceVerifyInput {
  invoiceCode: string;
  invoiceNo: string;
  invoiceDate: string;
  totalAmount: number;
  sellerTaxNo: string;
}

export interface VerifyResult {
  status: "verified" | "invalid" | "error";
  message: string;
}

export interface ProviderConfig {
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
}

// ── 统一入口（P2：读取配置表，自动选择服务商）────────────────────────────────

export async function verifyInvoiceWithConfig(
  companyId: string,
  input: InvoiceVerifyInput,
): Promise<VerifyResult> {
  // 动态 import 避免循环依赖（integration-config.routes → invoice-verify → integration-config.routes）
  const { loadInvoiceVerifyConfig } = await import("../settings/integration-config.routes.js");
  const cfg = await loadInvoiceVerifyConfig(companyId);

  switch (cfg.provider) {
    case "etax_nsrsbh": return verifyViaEtax(input, cfg);
    case "baiwang":     return verifyViaBaiwang(input, cfg);
    case "nuonuo":      return verifyViaNuonuo(input, cfg);
    case "custom":      return verifyViaCustom(input, cfg);
    default:            return verifyInvoiceLocally(input);   // 'local'
  }
}

// ── 本地规则验证（P1，无需配置）──────────────────────────────────────────────

export async function verifyInvoiceLocally(input: InvoiceVerifyInput): Promise<VerifyResult> {
  const issues: string[] = [];

  if (!/^\d{8}$/.test(input.invoiceNo.trim())) {
    issues.push("发票号码格式不正确（应为8位数字）");
  }

  const code = input.invoiceCode?.trim() ?? "";
  if (code && !/^\d{10}$/.test(code) && !/^\d{12}$/.test(code)) {
    issues.push("发票代码格式不正确（应为10位或12位数字）");
  }

  const ts = new Date(input.invoiceDate).getTime();
  if (isNaN(ts)) {
    issues.push("开票日期格式错误");
  } else if (ts > Date.now() + 86400000) {
    issues.push("开票日期不能晚于今日");
  } else if (ts < new Date("2015-01-01").getTime()) {
    issues.push("开票日期早于2015年，请确认");
  }

  if (input.totalAmount <= 0) {
    issues.push("发票金额必须大于0");
  } else if (input.totalAmount > 10_000_000) {
    issues.push("单张发票金额超过1000万，请人工核查");
  }

  const taxNo = input.sellerTaxNo?.trim() ?? "";
  if (taxNo && !/^[A-Z0-9]{15,20}$/i.test(taxNo)) {
    issues.push("销售方纳税人识别号格式异常");
  }

  if (issues.length > 0) {
    return { status: "invalid", message: issues.join("；") };
  }
  return {
    status: "verified",
    message: "本地规则校验通过（如需接入电子税务局实时验真，请在系统设置→外部对接中配置）",
  };
}

// ── 国家税务总局查验平台 ──────────────────────────────────────────────────────
// 参考：https://www.chinatax.gov.cn/
// 实际接口需企业准入申请，此处为标准调用格式
// 测试环境可用 https://fpdk.nsrsbh.com/chaxun/cx.html (网页版)

async function verifyViaEtax(input: InvoiceVerifyInput, cfg: ProviderConfig): Promise<VerifyResult> {
  if (!cfg.apiKey) {
    return { status: "error", message: "未配置国税平台 API Key，请在设置中填写" };
  }

  try {
    const body = {
      fpqqlsh: `FP${Date.now()}`,    // 发票请求流水号（唯一）
      fpdm:  input.invoiceCode,
      fphm:  input.invoiceNo,
      kprq:  input.invoiceDate.replace(/-/g, ""),  // YYYYMMDD
      kjje:  input.totalAmount.toFixed(2),
    };

    const res = await fetch("https://fpdk.nsrsbh.com/chaxun/cx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
        "User-Agent": "FinanceTaxation/3.0",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { status: "error", message: `国税平台返回 HTTP ${res.status}` };
    }

    const data = await res.json() as { returnStateInfo?: { returnCode?: string; returnMessage?: string }; result?: boolean };
    const code = data.returnStateInfo?.returnCode ?? "";
    const msg  = data.returnStateInfo?.returnMessage ?? "无返回信息";

    if (code === "0000" || data.result === true) {
      return { status: "verified", message: `国税平台验真通过 (${msg})` };
    }
    if (code === "9999" || code === "1001") {
      return { status: "invalid", message: `发票信息不符：${msg}` };
    }
    return { status: "error", message: `国税平台返回码 ${code}：${msg}` };

  } catch (err) {
    const message = err instanceof Error ? err.message : "网络超时";
    return { status: "error", message: `连接国税平台失败：${message}` };
  }
}

// ── 百望云验真 ────────────────────────────────────────────────────────────────
// 文档：https://developer.baiwang.com/
// 接口：POST https://openapi.baiwang.com/invoice/v1/check

async function verifyViaBaiwang(input: InvoiceVerifyInput, cfg: ProviderConfig): Promise<VerifyResult> {
  if (!cfg.apiKey || !cfg.appId) {
    return { status: "error", message: "未配置百望云 apiKey 或 appId，请在设置中填写" };
  }

  try {
    const timestamp = String(Date.now());
    const body = {
      appId:       cfg.appId,
      timestamp,
      invoiceCode: input.invoiceCode,
      invoiceNo:   input.invoiceNo,
      invoiceDate: input.invoiceDate,
      invoiceAmount: String(input.totalAmount),
    };

    const res = await fetch("https://openapi.baiwang.com/invoice/v1/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BW-AppId": cfg.appId,
        "X-BW-ApiKey": cfg.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { status: "error", message: `百望云返回 HTTP ${res.status}` };
    }

    const data = await res.json() as { code?: string; message?: string; data?: { checkResult?: string } };
    const checkResult = data.data?.checkResult;

    if (data.code === "0" && checkResult === "01") {
      return { status: "verified", message: "百望云验真通过：发票信息一致" };
    }
    if (checkResult === "02" || checkResult === "03") {
      return { status: "invalid", message: `百望云验真不通过：${data.message ?? "发票信息不符"}` };
    }
    return { status: "error", message: `百望云返回：${data.message ?? "未知错误"} (code: ${data.code})` };

  } catch (err) {
    return { status: "error", message: `连接百望云失败：${err instanceof Error ? err.message : "超时"}` };
  }
}

// ── 诺诺网验真 ────────────────────────────────────────────────────────────────
// 文档：https://open.nuonuo.com/
// 接口：POST https://sandbox.nuonuocs.cn/open/v1/invoices/queryByCode （沙箱）

async function verifyViaNuonuo(input: InvoiceVerifyInput, cfg: ProviderConfig): Promise<VerifyResult> {
  if (!cfg.apiKey || !cfg.apiSecret) {
    return { status: "error", message: "未配置诺诺网 accessToken 或 secret，请在设置中填写" };
  }

  try {
    const body = {
      fpDm: input.invoiceCode,
      fpHm: input.invoiceNo,
      kpRq: input.invoiceDate,
      je:   String(input.totalAmount),
    };

    const baseUrl = cfg.endpointUrl ?? "https://open.nuonuocs.cn/open/v1/invoices/queryByCode";

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
        "X-NUONUO-Secret": cfg.apiSecret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { status: "error", message: `诺诺网返回 HTTP ${res.status}` };
    }

    const data = await res.json() as { code?: string; describe?: string; result?: { cyjg?: string } };
    const cyjg = data.result?.cyjg;   // 查验结果：0001=一致, 0004=不一致

    if (cyjg === "0001") {
      return { status: "verified", message: "诺诺网验真通过：发票信息一致" };
    }
    if (cyjg === "0004") {
      return { status: "invalid", message: "诺诺网验真：发票信息不一致，请核查发票详情" };
    }
    return { status: "error", message: `诺诺网返回：${data.describe ?? "未知"} (code: ${data.code})` };

  } catch (err) {
    return { status: "error", message: `连接诺诺网失败：${err instanceof Error ? err.message : "超时"}` };
  }
}

// ── 自定义接口 ────────────────────────────────────────────────────────────────
// 规范：POST {invoiceCode, invoiceNo, invoiceDate, totalAmount} → {valid: bool, message: string}

async function verifyViaCustom(input: InvoiceVerifyInput, cfg: ProviderConfig): Promise<VerifyResult> {
  if (!cfg.endpointUrl) {
    return { status: "error", message: "未配置自定义接口地址（endpointUrl），请在设置中填写" };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

    const res = await fetch(cfg.endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        invoiceCode: input.invoiceCode,
        invoiceNo:   input.invoiceNo,
        invoiceDate: input.invoiceDate,
        totalAmount: input.totalAmount,
        sellerTaxNo: input.sellerTaxNo,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { status: "error", message: `自定义接口返回 HTTP ${res.status}` };
    }

    const data = await res.json() as { valid?: boolean; ok?: boolean; message?: string; msg?: string };
    const isValid = data.valid ?? data.ok;
    const msg = data.message ?? data.msg ?? "";

    if (isValid === true)  return { status: "verified", message: msg || "自定义接口验真通过" };
    if (isValid === false) return { status: "invalid",  message: msg || "自定义接口验真：发票不合规" };
    return { status: "error", message: `自定义接口返回格式异常（缺少 valid 字段）` };

  } catch (err) {
    return { status: "error", message: `连接自定义接口失败：${err instanceof Error ? err.message : "超时"}` };
  }
}

// ── 连接测试（供 settings 路由调用）─────────────────────────────────────────

export async function testInvoiceVerifyProvider(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
  // 用一张典型的测试发票参数来验真（不会影响真实业务数据）
  const testInput: InvoiceVerifyInput = {
    invoiceCode: "3100194130",   // 合法格式的10位代码
    invoiceNo:   "12345678",
    invoiceDate: "2026-01-15",
    totalAmount: 1130.00,
    sellerTaxNo: "91310101MA1FL4LC06",
  };

  if (cfg.provider === "local") {
    return { ok: true, message: "本地规则模式无需测试连接，随时可用" };
  }

  if (cfg.provider === "etax_nsrsbh" && !cfg.apiKey) {
    return { ok: false, message: "请先填写 API Key 再测试" };
  }
  if (cfg.provider === "baiwang" && (!cfg.apiKey || !cfg.appId)) {
    return { ok: false, message: "百望云需要 API Key 和 App ID，请先完整填写" };
  }
  if (cfg.provider === "nuonuo" && (!cfg.apiKey || !cfg.apiSecret)) {
    return { ok: false, message: "诺诺网需要 Access Token 和 Secret，请先完整填写" };
  }
  if (cfg.provider === "custom" && !cfg.endpointUrl) {
    return { ok: false, message: "自定义接口需要填写 Endpoint URL" };
  }

  try {
    let result: VerifyResult;
    switch (cfg.provider) {
      case "etax_nsrsbh": result = await verifyViaEtax(testInput, cfg);    break;
      case "baiwang":     result = await verifyViaBaiwang(testInput, cfg);  break;
      case "nuonuo":      result = await verifyViaNuonuo(testInput, cfg);   break;
      case "custom":      result = await verifyViaCustom(testInput, cfg);   break;
      default:            result = await verifyInvoiceLocally(testInput);
    }

    // 对于测试调用，invalid 也算连通（说明接口响应正常，只是测试数据不真实）
    const connected = result.status !== "error";
    return {
      ok: connected,
      message: connected
        ? `连接成功（${result.message}）`
        : `连接失败：${result.message}`,
    };
  } catch (err) {
    return { ok: false, message: `测试异常：${err instanceof Error ? err.message : "未知错误"}` };
  }
}

// ── OCR 提取（保留 P1 实现）──────────────────────────────────────────────────

export interface ExtractedInvoiceFields {
  invoiceType?: string;
  invoiceCode?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  sellerName?: string;
  sellerTaxNo?: string;
  buyerName?: string;
  buyerTaxNo?: string;
  amount?: number;
  taxAmount?: number;
  totalAmount?: number;
  taxRate?: number;
}

export async function ocrExtractInvoice(
  companyId: string,
  rawText: string,
  imageBase64?: string,
): Promise<ExtractedInvoiceFields | null> {
  try {
    const aiConfig = await loadAiConfig(companyId);
    if (!aiConfig?.apiKey) {
      return extractByRegex(rawText);
    }

    const client = new Anthropic({ apiKey: aiConfig.apiKey });

    const prompt = `你是一个专业的中国增值税发票OCR识别助手。
请从以下发票文本中提取结构化信息，以JSON格式返回。
如果某个字段无法识别，设置为null。金额字段返回数字（不含货币符号）。

发票文本：
${rawText || "（图片内容，请从图片中识别）"}

请返回JSON格式（只返回JSON，不要其他文字）：
{
  "invoiceType": "增值税专用发票|增值税普通发票|电子发票|...",
  "invoiceCode": "发票代码（10或12位数字）",
  "invoiceNo": "发票号码（8位数字）",
  "invoiceDate": "YYYY-MM-DD格式",
  "sellerName": "销售方名称",
  "sellerTaxNo": "销售方纳税人识别号",
  "buyerName": "购买方名称",
  "buyerTaxNo": "购买方纳税人识别号",
  "amount": 不含税金额数字,
  "taxAmount": 税额数字,
  "totalAmount": 价税合计数字,
  "taxRate": 税率数字如0.13表示13%
}`;

    const messages: Anthropic.MessageParam[] = [];
    if (imageBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const response = await client.messages.create({
      model: aiConfig.model ?? "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages,
    });

    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return extractByRegex(rawText);

    return JSON.parse(jsonMatch[0]) as ExtractedInvoiceFields;
  } catch {
    return extractByRegex(rawText);
  }
}

function extractByRegex(text: string): ExtractedInvoiceFields | null {
  if (!text) return null;
  const result: ExtractedInvoiceFields = {};

  const codeM = text.match(/发票代码[：:]\s*(\d{10,12})/);
  if (codeM) result.invoiceCode = codeM[1];

  const noM = text.match(/发票号码[：:]\s*(\d{8})/);
  if (noM) result.invoiceNo = noM[1];

  const dateM = text.match(/开票日期[：:]\s*(\d{4})年(\d{2})月(\d{2})日/);
  if (dateM) result.invoiceDate = `${dateM[1]}-${dateM[2]}-${dateM[3]}`;

  const taxNoM = text.match(/纳税人识别号[：:]\s*([A-Z0-9]{15,20})/i);
  if (taxNoM) result.sellerTaxNo = taxNoM[1];

  const amtM = text.match(/合\s*计.*?([0-9,.]+)/);
  if (amtM?.[1]) result.totalAmount = parseFloat(amtM[1].replace(/,/g, ""));

  return Object.keys(result).length > 0 ? result : null;
}
