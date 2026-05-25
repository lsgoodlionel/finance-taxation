import type { BusinessEvent, RiskFinding, TaxItem, Voucher } from "@finance-taxation/domain-model";

export function resolvePayrollLinkedEventId(
  period: string,
  linkedEventIds: Record<string, string>,
  events: BusinessEvent[]
) {
  if (linkedEventIds[period]) {
    return linkedEventIds[period];
  }

  const expectedTitle = `${period} 工资计提与薪酬发放事项`;
  const matched = events.find((event) => event.type === "payroll" && event.title === expectedTitle);
  return matched?.id ?? null;
}

export function buildPayrollArtifactSummary(input: {
  taxItems: TaxItem[];
  vouchers: Voucher[];
  risks: RiskFinding[];
}) {
  const taxHighlights = input.taxItems.map((item) => `${item.taxType}｜${item.status}`);
  const voucherHighlights = input.vouchers.map((voucher) => `${voucher.voucherType}｜${voucher.status}｜${voucher.summary}`);
  const riskHighlights = input.risks.map((risk) => `${risk.priority || "—"}｜${risk.title}`);

  const pendingActions: string[] = [];
  if (input.taxItems.length === 0) {
    pendingActions.push("补生成工资税务事项");
  }
  if (input.vouchers.length === 0) {
    pendingActions.push("补生成工资凭证建议");
  }
  if (input.risks.length > 0) {
    pendingActions.push(`处理 ${input.risks.length} 条工资风险`);
  }

  return {
    taxHighlights,
    voucherHighlights,
    riskHighlights,
    pendingActions
  };
}
