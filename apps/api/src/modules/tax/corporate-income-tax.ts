import {
  resolveCorporateIncomeTaxTreatment,
  type TaxQualification
} from "./corporate-income-tax-rate.js";
import {
  applyLossCarryforward,
  resolveCarryforwardYears,
  type LossLedgerEntry
} from "./loss-carryforward.js";
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
  /** 公司的税收资格档案。缺失项为 null 时不猜，报「资格待确认」。 */
  qualification: TaxQualification;
  /** 判定基准日，用来看高新资质是否还在有效期内。 */
  on: string;
  /** 以前年度亏损台账。空数组 = 没有可弥补的亏损。 */
  lossLedger: readonly LossLedgerEntry[];
  /** 本期已预缴的企业所得税（分）。 */
  prepaidTaxCents: number;
}): CorporateIncomeTaxPreparation {
  // 会计利润 = 利润总额（税前），不是净利润；用 netProfit 会把所得税费用重复扣除，
  // 低估应纳税所得额与预缴税额。对应企业所得税申报表主表「利润总额」行。
  //
  // **不再 Math.max(x, 0)**：亏损抹成 0 之后，当期不缴税的结论没错，
  // 但「可结转多少亏损到以后年度」这个信息一起没了。亏损是资产。
  const accountingProfit = parseAmount(input.profitStatement.totals.totalProfit);
  const taxableIncomeEstimate = accountingProfit;

  // ── 先弥补以前年度亏损，再按弥补后的余额算税 ────────────────────────
  //
  // **顺序不能反**：先算税再减亏损会把税率作用在没弥补的基数上，
  // 多算出来的部分正好是「弥补权利」被浪费掉的那块。
  const isHighTech = input.qualification.highTechCertificateExpiresOn !== null;
  const lossResult = applyLossCarryforward({
    taxableIncomeCents: Math.round(taxableIncomeEstimate * 100),
    currentYear: Number(input.on.slice(0, 4)),
    losses: input.lossLedger,
    carryforwardYears: resolveCarryforwardYears({ isHighTech })
  });

  // 税率按优惠资格判定，不再写死 25%。资格信息缺失时返回 null——
  // 按最高档兜底会让本该按 5% 的小微企业多交五倍，且用户看不出是猜的。
  const treatment = resolveCorporateIncomeTaxTreatment({
    taxableIncomeCents: lossResult.remainingIncomeCents,
    qualification: input.qualification,
    on: input.on
  });

  // 应补（正）/ 应退（负）。**负数不截断成 0**——那等于让企业白交。
  const taxPayableOrRefundableCents =
    treatment.taxAmountCents === null ? null : treatment.taxAmountCents - input.prepaidTaxCents;

  const expiredLossNotice =
    lossResult.expired.length === 0
      ? ""
      : `以下年度的亏损已超过结转年限，不能再弥补：${lossResult.expired
          .map((item) => `${item.lossYear} 年（剩余 ${formatAmount(item.remainingCents / 100)} 元）`)
          .join("、")}。`;

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
    incomeTaxRate:
      treatment.effectiveRatePercent === null ? null : String(treatment.effectiveRatePercent),
    preferenceKind: treatment.kind,
    preferenceNotice: treatment.reason,
    reducedInclusionPercent:
      treatment.reducedInclusionPercent === null ? null : String(treatment.reducedInclusionPercent),
    appliedRatePercent:
      treatment.appliedRatePercent === null ? null : String(treatment.appliedRatePercent),
    prepaymentTaxEstimate:
      treatment.taxAmountCents === null ? null : formatAmount(treatment.taxAmountCents / 100),
    carryforwardLoss: formatAmount(treatment.carryforwardLossCents / 100),
    lossOffset: formatAmount(lossResult.offsetCents / 100),
    taxableIncomeAfterLoss: formatAmount(lossResult.remainingIncomeCents / 100),
    expiredLossNotice,
    prepaidTax: formatAmount(input.prepaidTaxCents / 100),
    taxPayableOrRefundable:
      taxPayableOrRefundableCents === null
        ? null
        : formatAmount(taxPayableOrRefundableCents / 100),
    adjustmentHints,
    checklist
  };
}
