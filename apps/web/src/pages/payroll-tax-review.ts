import type { IndividualIncomeTaxMaterial, PayrollRecord } from "@finance-taxation/domain-model";

function fmt(value: number) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPayrollTaxReviewSummary(input: {
  period: string;
  records: PayrollRecord[];
  linkedEventId: string | null;
  taxItemCount: number;
  iitMaterial: IndividualIncomeTaxMaterial | null;
}) {
  const employeeIit = input.records.reduce((sum, record) => sum + record.iitWithheld, 0);
  const employeeSocial = input.records.reduce((sum, record) => sum + record.socialSecurityEmployee, 0);
  const employeeHousing = input.records.reduce((sum, record) => sum + record.housingFundEmployee, 0);

  const pendingActions: string[] = [];
  if (!input.linkedEventId) {
    pendingActions.push("生成工资事项并同步税务");
  }
  if (!input.iitMaterial) {
    pendingActions.push("生成个税申报资料");
  }
  if (input.taxItemCount === 0) {
    pendingActions.push("复核工资税务事项");
  }

  return {
    status: pendingActions.length === 0 ? "ready" : "pending",
    highlights: [
      `员工个税合计 ${fmt(employeeIit)} 元`,
      `个人社保合计 ${fmt(employeeSocial)} 元`,
      `个人公积金合计 ${fmt(employeeHousing)} 元`
    ],
    pendingActions,
    checklist: input.iitMaterial?.checklist ?? [],
    filingPeriod: input.iitMaterial?.filingPeriod ?? input.period
  };
}
