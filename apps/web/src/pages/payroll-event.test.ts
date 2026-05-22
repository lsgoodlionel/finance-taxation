import { buildPayrollEventInput } from "./payroll-event";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const input = buildPayrollEventInput("2026-05", [
  {
    id: "pr-1",
    companyId: "company-1",
    period: "2026-05",
    employeeId: "emp-1",
    employeeName: "张三",
    grossSalary: 12000,
    socialSecurityEmployee: 1200,
    socialSecurityEmployer: 2500,
    housingFundEmployee: 800,
    housingFundEmployer: 800,
    iitWithheld: 300,
    netPay: 9700,
    status: "draft",
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: "",
    notes: "",
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "pr-2",
    companyId: "company-1",
    period: "2026-05",
    employeeId: "emp-2",
    employeeName: "李四",
    grossSalary: 8000,
    socialSecurityEmployee: 800,
    socialSecurityEmployer: 1600,
    housingFundEmployee: 500,
    housingFundEmployer: 500,
    iitWithheld: 100,
    netPay: 6600,
    status: "confirmed",
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: "",
    notes: "",
    createdAt: "",
    updatedAt: ""
  }
]);

expectEqual(input.type, "payroll", "payroll event type should be payroll");
expectEqual(input.title, "2026-05 工资计提与薪酬发放事项", "title should include period");
expectEqual(input.department, "人事行政部", "department should be hr admin");
expectEqual(input.amount, "20000.00", "amount should equal total gross salary");
expectEqual(input.occurredOn, "2026-05-01", "occurredOn should use payroll period first day");

if (!input.description.includes("人数：2") || !input.description.includes("代扣个税合计：400.00 CNY")) {
  throw new Error(`description not aggregated correctly: ${input.description}`);
}

console.log("payroll-event-ok");
