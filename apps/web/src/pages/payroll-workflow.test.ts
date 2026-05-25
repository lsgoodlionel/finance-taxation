import type { PayrollRecord } from "@finance-taxation/domain-model";
import { buildPayrollWorkflow } from "./payroll-workflow";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectTrue(value: boolean, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

const records: PayrollRecord[] = [
  {
    id: "pr-1",
    companyId: "cmp-1",
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
    status: "confirmed",
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: "",
    notes: "",
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "pr-2",
    companyId: "cmp-1",
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
    status: "draft",
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedByName: "",
    notes: "",
    createdAt: "",
    updatedAt: ""
  }
];

const pendingWorkflow = buildPayrollWorkflow({
  period: "2026-05",
  records,
  linkedEventId: null
});

expectEqual(pendingWorkflow.steps[0]?.title, "工资计算", "workflow should start with payroll computation");
expectEqual(pendingWorkflow.steps[0]?.state, "done", "existing records mean payroll is computed");
expectEqual(pendingWorkflow.steps[1]?.title, "工资确认", "workflow should include payroll confirmation");
expectEqual(pendingWorkflow.steps[1]?.state, "pending", "draft records should block confirmation");
expectEqual(pendingWorkflow.steps[2]?.title, "生成工资事项", "workflow should include event creation");
expectEqual(pendingWorkflow.steps[2]?.state, "pending", "missing event should be pending");
expectTrue(pendingWorkflow.recommendedActions.includes("confirm_records"), "workflow should recommend confirming records");
expectTrue(pendingWorkflow.recommendedActions.includes("create_event"), "workflow should recommend creating event");

const completedWorkflow = buildPayrollWorkflow({
  period: "2026-05",
  records: records.map((record) => ({ ...record, status: "confirmed" as const })),
  linkedEventId: "evt-payroll-1"
});

expectEqual(completedWorkflow.steps[1]?.state, "done", "all confirmed records should mark confirmation done");
expectEqual(completedWorkflow.steps[2]?.state, "done", "linked event should mark event creation done");
expectEqual(completedWorkflow.steps[3]?.title, "个税/社保/公积金复核", "workflow should include tax review");
expectTrue(completedWorkflow.summary.includes("建议进入税务中心"), "completed workflow should guide to tax review");

console.log("payroll-workflow-ok");
