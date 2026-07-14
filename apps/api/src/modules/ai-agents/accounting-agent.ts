/**
 * P6-A2 会计处理 Agent（规则优先，可留痕）
 *
 * 从经营事项推断会计分录建议：事项类型 → 凭证模板 → 借贷分录 + 判断依据。
 * 纯函数、确定性，便于单测；后续可叠加 LLM 增强（保留 rationale 结构）。
 */

import { buildVoucherTemplateDraft } from "../vouchers/templates.js";
import type { VoucherDraftLine } from "@finance-taxation/domain-model";

export interface EventForAccounting {
  id: string;
  type: string;
  title: string;
  amount: number | null;
  /** 发票方向（仅 type: "invoice" 时使用）：进项/销项。未提供时按标题关键词推断，无法判断则保守按进项处理。 */
  direction?: "input" | "output";
}

export interface AccountingSuggestion {
  templateKey: string | null;
  voucherType: string;
  lines: VoucherDraftLine[];
  rationale: string;
  confidence: number;
  needsReview: boolean;
}

interface TemplateMapping {
  key: string;
  reason: string;
  /** 该映射是否来自明确的事项类型（高置信度），还是标题关键词推断（较低置信度） */
  inferred: boolean;
}

// 事项类型 → 凭证模板（直接映射，无需子分类）
const TYPE_TEMPLATE: Record<string, { key: string; reason: string }> = {
  sales:        { key: "sales",       reason: "销售类事项：确认应收账款与主营业务收入" },
  procurement:  { key: "procurement", reason: "采购类事项：原材料入库，确认应付账款" },
  expense:      { key: "expense",     reason: "费用类事项：计入管理费用，挂其他应付款" },
  payroll:      { key: "payroll",     reason: "工资类事项：计提职工薪酬成本，确认应付职工薪酬" },
  asset:        { key: "asset",       reason: "资产类事项：确认固定资产，挂应付账款" },
  rnd:          { key: "rnd",         reason: "研发支出类事项：委外/费用化研发投入，确认研发费用与银行存款" },
};

// 发票方向关键词（type: "invoice" 时用于推断进项/销项）
const OUTPUT_INVOICE_KEYWORDS = ["销项", "开票收入", "确认收入", "开具"];
const INPUT_INVOICE_KEYWORDS = ["进项", "专用发票入账", "收到发票", "供应商发票"];

function classifyInvoiceDirection(event: EventForAccounting): { direction: "input" | "output"; inferred: boolean } {
  if (event.direction === "input" || event.direction === "output") {
    return { direction: event.direction, inferred: false };
  }
  if (OUTPUT_INVOICE_KEYWORDS.some((kw) => event.title.includes(kw))) {
    return { direction: "output", inferred: true };
  }
  if (INPUT_INVOICE_KEYWORDS.some((kw) => event.title.includes(kw))) {
    return { direction: "input", inferred: true };
  }
  // 无法判断时保守按进项/采购入账处理，避免误判为收入
  return { direction: "input", inferred: true };
}

// 融资类事项子分类关键词：股东出资/增资 vs 银行借款，会计处理截然不同，不可混用同一模板
const EQUITY_KEYWORDS = ["出资", "增资", "实缴", "注册资本"];
const LOAN_KEYWORDS = ["贷款", "借款", "授信"];

function classifyFinancing(title: string): TemplateMapping | null {
  if (EQUITY_KEYWORDS.some((kw) => title.includes(kw))) {
    return { key: "financing-equity", reason: "股东出资/增资到账：确认银行存款与实收资本", inferred: true };
  }
  if (LOAN_KEYWORDS.some((kw) => title.includes(kw))) {
    return { key: "financing-loan", reason: "银行借款到账：确认银行存款与短期借款", inferred: true };
  }
  return null;
}

// 税务类事项子分类关键词：企业所得税计提、印花税等税金及附加计提是清晰的会计处理；
// 增值税月报（涉及既有销项税额结转）、个人所得税代扣代缴（本质是员工薪酬代扣而非公司费用）
// 无法从标题+金额可靠推断科目，保持人工判断，不提供模板。
const INCOME_TAX_KEYWORDS = ["企业所得税", "所得税预缴", "所得税汇算"];
const SURCHARGE_TAX_KEYWORDS = ["印花税", "城建税", "教育费附加", "税金及附加"];

function classifyTax(title: string): TemplateMapping | null {
  if (INCOME_TAX_KEYWORDS.some((kw) => title.includes(kw))) {
    return { key: "tax-income", reason: "企业所得税计提/预缴：确认所得税费用与应交税费-企业所得税", inferred: true };
  }
  if (SURCHARGE_TAX_KEYWORDS.some((kw) => title.includes(kw))) {
    return { key: "tax-surcharge", reason: "印花税等税金及附加：计提税金及附加与应交税费", inferred: true };
  }
  return null;
}

function resolveMapping(event: EventForAccounting): TemplateMapping | null {
  if (event.type === "invoice") {
    const { direction, inferred } = classifyInvoiceDirection(event);
    return direction === "output"
      ? { key: "sales", reason: "发票类事项（销项）：按销售模板确认应收账款与主营业务收入", inferred }
      : { key: "procurement", reason: "发票类事项（进项，或方向不明时保守按进项处理）：按采购模板确认存货与应付账款", inferred };
  }

  if (event.type === "financing") {
    return classifyFinancing(event.title);
  }

  if (event.type === "tax") {
    return classifyTax(event.title);
  }

  const mapping = TYPE_TEMPLATE[event.type];
  return mapping ? { ...mapping, inferred: false } : null;
}

export function suggestAccountingEntry(event: EventForAccounting): AccountingSuggestion {
  const amount = event.amount ?? 0;
  const mapping = resolveMapping(event);

  if (!mapping || amount <= 0) {
    return {
      templateKey: null,
      voucherType: "manual",
      lines: [],
      rationale: !mapping
        ? `事项类型「${event.type}」无标准分录模板（或标题无法判断具体子类型），建议人工判断科目。`
        : "事项金额缺失或为零，无法生成分录建议，请补全金额。",
      confidence: 0.2,
      needsReview: true,
    };
  }

  const draft = buildVoucherTemplateDraft({
    templateKey: mapping.key,
    amount: amount.toFixed(2),
    summary: event.title,
    businessEventId: event.id,
    companyId: "",
  });

  return {
    templateKey: mapping.key,
    voucherType: draft.voucherType,
    lines: draft.lines,
    rationale: `${mapping.reason}。金额 ¥${amount.toFixed(2)} 取自事项。请会计核对科目与税额拆分后过账。`,
    // 直接由事项类型映射的模板置信度更高；由标题关键词推断子类型（发票方向/融资借款或出资/税务子类）的置信度略低
    confidence: mapping.inferred ? 0.65 : 0.8,
    // draft-then-approve：无论置信度高低，财务分录入账前均需人工复核批准，这是设计而非缺陷
    needsReview: true,
  };
}
