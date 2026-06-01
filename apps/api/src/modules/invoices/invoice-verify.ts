/**
 * 发票验真（P1阶段：本地规则验证）
 *
 * P1 本地规则：
 *   1. 发票号码格式校验（8位数字）
 *   2. 发票代码格式校验（10位/12位，小规模10位，一般20位后两位非00）
 *   3. 开票日期合理性（不晚于今日，不早于2015年）
 *   4. 金额合理性（>0，<1000万单张限额）
 *   5. 销售方税号格式校验（15/18位统一社会信用代码）
 *
 * P2 升级路径：
 *   替换 verifyInvoiceLocally 为 verifyInvoiceViaApi，
 *   调用 https://fp.nsrsbh.com 或第三方百望/诺诺平台
 *   无需修改 invoice.routes.ts
 *
 * OCR 识别：复用现有 AI 服务的文本理解能力，
 * 从发票图片文字中提取结构化字段
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

// ── 本地规则验证（P1）────────────────────────────────────────────────────────

export async function verifyInvoiceLocally(input: InvoiceVerifyInput): Promise<VerifyResult> {
  const issues: string[] = [];

  // 发票号码：8位数字
  if (!/^\d{8}$/.test(input.invoiceNo.trim())) {
    issues.push("发票号码格式不正确（应为8位数字）");
  }

  // 发票代码：10位或12位数字（旧版 / 新版）
  const code = input.invoiceCode?.trim() ?? "";
  if (code && !/^\d{10}$/.test(code) && !/^\d{12}$/.test(code)) {
    issues.push("发票代码格式不正确（应为10位或12位数字）");
  }

  // 开票日期
  const invoiceTs = new Date(input.invoiceDate).getTime();
  const now = Date.now();
  const minTs = new Date("2015-01-01").getTime();
  if (isNaN(invoiceTs)) {
    issues.push("开票日期格式错误");
  } else if (invoiceTs > now + 86400000) {
    issues.push("开票日期不能晚于今日");
  } else if (invoiceTs < minTs) {
    issues.push("开票日期早于2015年，请确认");
  }

  // 金额
  if (input.totalAmount <= 0) {
    issues.push("发票金额必须大于0");
  } else if (input.totalAmount > 10_000_000) {
    issues.push("单张发票金额超过1000万，请人工核查");
  }

  // 纳税人识别号：15位数字、17位数字+2位验码、18位统一社会信用代码
  const taxNo = input.sellerTaxNo?.trim() ?? "";
  if (taxNo && !/^[A-Z0-9]{15,20}$/i.test(taxNo)) {
    issues.push("销售方纳税人识别号格式异常");
  }

  if (issues.length > 0) {
    return { status: "invalid", message: issues.join("；") };
  }

  // 通过本地规则
  return {
    status: "verified",
    message: `本地规则校验通过（P2阶段将接入电子税务局实时验真）发票号:${input.invoiceNo}`,
  };
}

// ── AI OCR 提取发票字段（P1）────────────────────────────────────────────────

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
      // 无AI配置时，尝试正则提取
      return extractByRegex(rawText);
    }

    const client = new Anthropic({ apiKey: aiConfig.apiKey });

    const prompt = `你是一个专业的中国增值税发票OCR识别助手。
请从以下发票文本中提取结构化信息，以JSON格式返回。
如果某个字段无法识别，设置为null。
金额字段返回数字（不含货币符号）。

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

// ── 正则备用提取（无AI配置时）────────────────────────────────────────────────

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
