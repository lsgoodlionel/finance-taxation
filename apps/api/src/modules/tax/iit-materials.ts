import type { IndividualIncomeTaxMaterial, LedgerEntry, TaxItem } from "@finance-taxation/domain-model";

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function buildIndividualIncomeTaxMaterials(
  companyId: string,
  filingPeriod: string,
  taxItems: TaxItem[],
  ledgerEntries: LedgerEntry[]
): IndividualIncomeTaxMaterial {
  const scopedTaxItems = taxItems.filter(
    (item) => item.filingPeriod === filingPeriod && item.taxType.includes("个人所得税")
  );
  const scopedPayroll = ledgerEntries.filter(
    (entry) => entry.entryDate.startsWith(filingPeriod) && entry.accountCode.startsWith("22110101")
  );
  const totalPayrollAmount = scopedPayroll.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

  return {
    companyId,
    filingPeriod,
    payrollEventCount: new Set(scopedPayroll.map((item) => item.businessEventId)).size,
    withholdingItemCount: scopedTaxItems.length,
    totalPayrollAmount: formatAmount(totalPayrollAmount),
    checklist: [
      "工资表与个税申报名单",
      "专项附加扣除信息",
      "个税代扣代缴申报表",
      "银行代发工资流水"
    ]
  };
}
