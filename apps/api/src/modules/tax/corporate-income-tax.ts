import type {
  CorporateIncomeTaxPreparation,
  ProfitStatementReport,
  RndProjectSummary,
  TaxItem
} from "@finance-taxation/domain-model";

function parseAmount(value: string): number {
  return Number(value || 0);
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function buildCorporateIncomeTaxPreparation(input: {
  companyId: string;
  filingPeriod: string;
  profitStatement: ProfitStatementReport;
  taxItems: TaxItem[];
  rndSummaries: RndProjectSummary[];
}): CorporateIncomeTaxPreparation {
  const accountingProfit = Math.max(parseAmount(input.profitStatement.totals.netProfit), 0);
  const taxableIncomeEstimate = accountingProfit;
  const incomeTaxRate = 25;
  const prepaymentTaxEstimate = taxableIncomeEstimate * incomeTaxRate * 0.01;

  const adjustmentHints: string[] = [];
  if (input.taxItems.some((item) => item.treatment.includes("业务招待"))) {
    adjustmentHints.push("存在业务招待费，汇算时需关注 60% 扣除比例和收入千分之五限额。");
  }
  if (input.taxItems.some((item) => item.treatment.includes("罚款") || item.treatment.includes("滞纳金"))) {
    adjustmentHints.push("存在罚款或滞纳金事项，企业所得税前通常不得扣除。");
  }
  if (input.rndSummaries.some((item) => Number(item.superDeductionEligibleBase) > 0)) {
    adjustmentHints.push("存在研发加计扣除基础，汇算前需准备研发辅助账和资料包。");
  }

  const checklist = [
    "复核本期利润表与总账收入、成本、费用是否一致。",
    "复核税会差异事项是否已形成备查说明。",
    "检查研发加计扣除、业务招待费、捐赠等专项口径。",
    "准备企业所得税预缴申报表和汇算清缴底稿。"
  ];

  return {
    companyId: input.companyId,
    filingPeriod: input.filingPeriod,
    accountingProfit: formatAmount(accountingProfit),
    taxableIncomeEstimate: formatAmount(taxableIncomeEstimate),
    incomeTaxRate: String(incomeTaxRate),
    prepaymentTaxEstimate: formatAmount(prepaymentTaxEstimate),
    adjustmentHints,
    checklist
  };
}
