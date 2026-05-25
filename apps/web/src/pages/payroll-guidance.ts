import type { PayrollRecord, RiskFinding, Voucher } from "@finance-taxation/domain-model";

export interface PayrollVoucherSuggestion {
  key: "payroll_accrual" | "employer_burden" | "iit_withholding" | "net_payment";
  title: string;
  summary: string;
}

function toAmount(value: number) {
  return value.toFixed(2);
}

export function buildPayrollVoucherSuggestions(records: PayrollRecord[], vouchers: Voucher[]): PayrollVoucherSuggestion[] {
  const gross = records.reduce((sum, item) => sum + item.grossSalary, 0);
  const employerBurden = records.reduce((sum, item) => sum + item.socialSecurityEmployer + item.housingFundEmployer, 0);
  const iit = records.reduce((sum, item) => sum + item.iitWithheld, 0);
  const netPay = records.reduce((sum, item) => sum + item.netPay, 0);
  const existingTypes = new Set(vouchers.map((voucher) => voucher.voucherType));

  const suggestions: PayrollVoucherSuggestion[] = [];

  if (!existingTypes.has("accrual")) {
    suggestions.push({
      key: "payroll_accrual",
      title: "工资计提凭证",
      summary: `借：管理费用-工资薪酬 ${toAmount(gross)}；贷：应付职工薪酬-工资 ${toAmount(gross)}`
    });
  }

  suggestions.push({
    key: "employer_burden",
    title: "单位社保公积金计提",
    summary: `借：管理费用-社保公积金 ${toAmount(employerBurden)}；贷：应付职工薪酬-社保公积金 ${toAmount(employerBurden)}`
  });
  suggestions.push({
    key: "iit_withholding",
    title: "代扣个税处理",
    summary: `借：应付职工薪酬-工资 ${toAmount(iit)}；贷：应交税费-应交个人所得税 ${toAmount(iit)}`
  });
  suggestions.push({
    key: "net_payment",
    title: "工资发放",
    summary: `借：应付职工薪酬-工资 ${toAmount(netPay)}；贷：银行存款 ${toAmount(netPay)}`
  });

  return suggestions;
}

export function buildPayrollRiskBuckets(risks: RiskFinding[]) {
  return {
    iit: risks.filter((risk) => risk.ruleCode.includes("IIT")),
    socialSecurity: risks.filter((risk) => risk.ruleCode.includes("SOCIAL")),
    housingFund: risks.filter((risk) => risk.ruleCode.includes("HOUSING")),
    other: risks.filter((risk) => !risk.ruleCode.includes("IIT") && !risk.ruleCode.includes("SOCIAL") && !risk.ruleCode.includes("HOUSING"))
  };
}
