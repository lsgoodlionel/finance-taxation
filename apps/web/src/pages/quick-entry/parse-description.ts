/**
 * 白话描述轻量解析（纯前端，无网络）：
 * 从「昨天请客户吃饭花了 800」这类一句话里提取 金额 / 日期 / 类型 / 对方单位。
 * 解析不到的字段返回 null，由上层走 AI 增强或让用户手填（降级路径）。
 */
import type { ParsedFields } from "./types";

const WAN = 10000;

/** 提取金额（元）。支持「800」「800元」「800块」「1.2万」「3,000元」等写法。 */
export function parseAmountFromText(text: string): string | null {
  const wanMatch = text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*万(?:元|块)?/);
  if (wanMatch?.[1]) {
    const value = Number.parseFloat(wanMatch[1].replace(/,/g, "")) * WAN;
    return Number.isFinite(value) && value > 0 ? String(value) : null;
  }

  const yuanMatch = text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:元|块钱|块)/);
  if (yuanMatch?.[1]) {
    const value = Number.parseFloat(yuanMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? String(value) : null;
  }

  const verbMatch = text.match(/(?:花了|花费|支付了?|付了|收了|收到|报销|用了)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (verbMatch?.[1]) {
    const value = Number.parseFloat(verbMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? String(value) : null;
  }

  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function shiftDays(base: Date, days: number): string {
  const shifted = new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** 提取日期。支持「今天/昨天/前天」「3天前」「7月14日」「2026-07-14」「2026年7月14日」。 */
export function parseDateFromText(text: string, today: Date): string | null {
  const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const cnFull = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})[日号]/);
  if (cnFull) {
    return toIsoDate(Number(cnFull[1]), Number(cnFull[2]), Number(cnFull[3]));
  }

  const cnShort = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (cnShort) {
    return toIsoDate(today.getFullYear(), Number(cnShort[1]), Number(cnShort[2]));
  }

  const daysAgo = text.match(/(\d{1,3})\s*天前/);
  if (daysAgo?.[1]) {
    return shiftDays(today, Number(daysAgo[1]));
  }

  if (text.includes("大前天")) return shiftDays(today, 3);
  if (text.includes("前天")) return shiftDays(today, 2);
  if (text.includes("昨天") || text.includes("昨日")) return shiftDays(today, 1);
  if (text.includes("今天") || text.includes("今日")) return shiftDays(today, 0);

  return null;
}

interface TypeRule {
  type: string;
  keywords: readonly string[];
}

/** 关键词 → events 类型枚举（沿用现有 key，顺序即优先级） */
const TYPE_RULES: readonly TypeRule[] = [
  { type: "travel_expense", keywords: ["差旅", "出差", "机票", "高铁", "火车票", "酒店", "住宿", "打车"] },
  { type: "expense", keywords: ["招待", "请客", "宴请", "聚餐", "吃饭", "办公用品", "水电", "房租", "快递"] },
  { type: "payroll", keywords: ["工资", "薪资", "薪酬", "发薪", "奖金"] },
  { type: "tax", keywords: ["缴税", "税款", "申报", "完税"] },
  { type: "asset", keywords: ["设备", "电脑", "服务器", "固定资产", "家具"] },
  { type: "rnd", keywords: ["研发", "开发投入"] },
  { type: "contract_revenue", keywords: ["合同款", "合同收入", "回款"] },
  { type: "sales", keywords: ["货款", "客户打款", "销售收入", "收到客户"] },
  { type: "procurement", keywords: ["采购", "进货", "购置", "买了"] },
  { type: "expense", keywords: ["报销"] }
];

/** 从白话里猜业务类型；猜不出返回 null（上层降级为手选）。 */
export function inferEventTypeFromText(text: string): string | null {
  for (const rule of TYPE_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.type;
    }
  }
  return null;
}

const COUNTERPARTY_SUFFIX =
  /([一-龥A-Za-z0-9]{2,20}(?:公司|集团|超市|商行|酒店|餐厅|饭店|商店|中心|事务所|银行))/;
const COUNTERPARTY_PREFIX =
  /(?:客户|供应商)([一-龥A-Za-z0-9]{2,10}?)(?=的|，|。|、|\s|付|还|没|要|已|催|开|$)/;
/** 名称开头常见的动词/介词噪音（「收到远大公司」→「远大公司」） */
const LEADING_NOISE = /^(?:收到了?|支付给|付款给|付给|打给|给|在|去|从|向|和|跟|请|把|了|我们|我)/;

function stripLeadingNoise(raw: string): string {
  let value = raw;
  let previous = "";
  while (previous !== value) {
    previous = value;
    value = value.replace(LEADING_NOISE, "");
  }
  return value;
}

/** 提取对方单位：优先「XX公司/酒店…」，其次「客户XX / 供应商XX」。 */
export function parseCounterpartyFromText(text: string): string | null {
  const suffix = text.match(COUNTERPARTY_SUFFIX);
  if (suffix?.[1]) {
    const cleaned = stripLeadingNoise(suffix[1]);
    if (cleaned.length >= 2) return cleaned;
  }
  const prefix = text.match(COUNTERPARTY_PREFIX);
  if (prefix?.[1]) {
    return prefix[1];
  }
  return null;
}

/** 一句白话 → 四字段解析（纯本地正则，永远可用的降级基线）。 */
export function parseDescription(text: string, today: Date): ParsedFields {
  return {
    type: inferEventTypeFromText(text),
    amount: parseAmountFromText(text),
    occurredOn: parseDateFromText(text, today),
    counterparty: parseCounterpartyFromText(text)
  };
}

/**
 * 后端 OCR/AI 结构化结果（/api/invoices/ocr 的 extracted）→ 四字段。
 * 字段名对齐后端 ExtractedInvoiceFields；缺失或非法值一律 null。
 */
export function parseOcrExtracted(extracted: Record<string, unknown> | null): ParsedFields {
  if (!extracted) {
    return { type: null, amount: null, occurredOn: null, counterparty: null };
  }
  const totalAmount = extracted["totalAmount"];
  const amount =
    typeof totalAmount === "number" && Number.isFinite(totalAmount) && totalAmount > 0
      ? String(totalAmount)
      : null;
  const invoiceDate = extracted["invoiceDate"];
  const occurredOn =
    typeof invoiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ? invoiceDate : null;
  const sellerName = extracted["sellerName"];
  const counterparty = typeof sellerName === "string" && sellerName.trim() ? sellerName.trim() : null;
  return { type: null, amount, occurredOn, counterparty };
}

/** 合并两组解析结果：primary 优先，缺的字段用 fallback 补。 */
export function mergeParsedFields(primary: ParsedFields, fallback: ParsedFields): ParsedFields {
  return {
    type: primary.type ?? fallback.type,
    amount: primary.amount ?? fallback.amount,
    occurredOn: primary.occurredOn ?? fallback.occurredOn,
    counterparty: primary.counterparty ?? fallback.counterparty
  };
}
