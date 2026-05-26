import type { PayrollRecord, PayrollTaxReviewLedger, TaxItem } from "@finance-taxation/domain-model";

function toMoney(value: number) {
  return value.toFixed(2);
}

export function buildPayrollTaxReviewLedgers({
  companyId,
  period,
  businessEventId,
  records,
  taxItems
}: {
  companyId: string;
  period: string;
  businessEventId: string | null;
  records: PayrollRecord[];
  taxItems: TaxItem[];
}): PayrollTaxReviewLedger[] {
  const iitTaxItems = taxItems.filter((item) => item.taxType === "个人所得税");
  const socialTaxItems = taxItems.filter((item) => item.taxType === "社保公积金");
  const now = new Date().toISOString();
  const readyStatus = businessEventId
    ? taxItems.length > 0 && taxItems.every((item) => item.status === "ready")
      ? "reviewed"
      : "ready"
    : "pending";

  return [
    {
      id: `payroll-review-${period}-iit`,
      companyId,
      period,
      reviewType: "iit",
      businessEventId,
      taxItemIds: iitTaxItems.map((item) => item.id),
      totalEmployeeAmount: toMoney(records.reduce((sum, item) => sum + item.iitWithheld, 0)),
      totalEmployerAmount: "0.00",
      status: readyStatus,
      notes: "个税资料需复核累计预扣、专项附加扣除和申报口径。",
      updatedAt: now
    },
    {
      id: `payroll-review-${period}-social-security`,
      companyId,
      period,
      reviewType: "social_security",
      businessEventId,
      taxItemIds: socialTaxItems.map((item) => item.id),
      totalEmployeeAmount: toMoney(records.reduce((sum, item) => sum + item.socialSecurityEmployee, 0)),
      totalEmployerAmount: toMoney(records.reduce((sum, item) => sum + item.socialSecurityEmployer, 0)),
      status: readyStatus,
      notes: "社保台账需复核在职人数、缴费基数与单位/个人承担金额。",
      updatedAt: now
    },
    {
      id: `payroll-review-${period}-housing-fund`,
      companyId,
      period,
      reviewType: "housing_fund",
      businessEventId,
      taxItemIds: socialTaxItems.map((item) => item.id),
      totalEmployeeAmount: toMoney(records.reduce((sum, item) => sum + item.housingFundEmployee, 0)),
      totalEmployerAmount: toMoney(records.reduce((sum, item) => sum + item.housingFundEmployer, 0)),
      status: readyStatus,
      notes: "公积金台账需复核基数、比例和缴存人数。",
      updatedAt: now
    }
  ];
}
