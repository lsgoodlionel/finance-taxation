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
}

export interface AccountingSuggestion {
  templateKey: string | null;
  voucherType: string;
  lines: VoucherDraftLine[];
  rationale: string;
  confidence: number;
  needsReview: boolean;
}

// 事项类型 → 凭证模板
const TYPE_TEMPLATE: Record<string, { key: string; reason: string }> = {
  sales:        { key: "sales",       reason: "销售类事项：确认应收账款与主营业务收入" },
  procurement:  { key: "procurement", reason: "采购类事项：原材料入库，确认应付账款" },
  expense:      { key: "expense",     reason: "费用类事项：计入管理费用，挂其他应付款" },
  payroll:      { key: "payroll",     reason: "工资类事项：计提职工薪酬成本，确认应付职工薪酬" },
  asset:        { key: "asset",       reason: "资产类事项：确认固定资产，挂应付账款" },
  invoice:      { key: "procurement", reason: "发票类事项：按采购入账（销项发票请用销售模板）" },
};

export function suggestAccountingEntry(event: EventForAccounting): AccountingSuggestion {
  const amount = event.amount ?? 0;
  const mapping = TYPE_TEMPLATE[event.type];

  if (!mapping || amount <= 0) {
    return {
      templateKey: null,
      voucherType: "manual",
      lines: [],
      rationale: !mapping
        ? `事项类型「${event.type}」无标准分录模板，建议人工判断科目。`
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
    confidence: 0.75,
    needsReview: true,
  };
}
