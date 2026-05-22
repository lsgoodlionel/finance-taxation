import type { CreateBusinessEventInput, PayrollRecord } from "@finance-taxation/domain-model";

export function buildPayrollEventInput(
  period: string,
  records: PayrollRecord[]
): CreateBusinessEventInput {
  const headcount = records.length;
  const totalGross = records.reduce((sum, record) => sum + record.grossSalary, 0);
  const totalNet = records.reduce((sum, record) => sum + record.netPay, 0);
  const totalIit = records.reduce((sum, record) => sum + record.iitWithheld, 0);
  const totalEmployerBurden = records.reduce(
    (sum, record) => sum + record.socialSecurityEmployer + record.housingFundEmployer,
    0
  );

  return {
    type: "payroll",
    title: `${period} 工资计提与薪酬发放事项`,
    description: [
      `工资期间：${period}`,
      `人数：${headcount}`,
      `应发工资合计：${totalGross.toFixed(2)} CNY`,
      `实发工资合计：${totalNet.toFixed(2)} CNY`,
      `代扣个税合计：${totalIit.toFixed(2)} CNY`,
      `单位社保公积金合计：${totalEmployerBurden.toFixed(2)} CNY`,
      "该事项由工资管理页发起，后续请在任务、税务与凭证中心继续处理。"
    ].join("\n"),
    department: "人事行政部",
    occurredOn: `${period}-01`,
    amount: totalGross > 0 ? totalGross.toFixed(2) : null,
    currency: "CNY",
    source: "manual"
  };
}
