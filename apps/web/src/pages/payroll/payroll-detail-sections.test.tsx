import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PayrollEmployeeForm } from "./PayrollEmployeeForm";
import { PayrollPolicyForm } from "./PayrollPolicyForm";
import { PayrollRecordsTable } from "./PayrollRecordsTable";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const employeeFormHtml = renderToStaticMarkup(
  createElement(PayrollEmployeeForm, {
    editingName: "张三",
    form: {
      name: "张三",
      idCard: "123",
      position: "工程师",
      hireDate: "2026-01-01",
      baseSalary: "12000",
      notes: "备注"
    },
    onChange: () => {},
    onSubmit: () => {},
    onCancel: () => {},
    primaryLabel: "保存修改"
  })
);

assert(employeeFormHtml.includes("编辑员工：张三"), "expected employee form title");
assert(employeeFormHtml.includes("保存修改"), "expected employee form action");

const recordsTableHtml = renderToStaticMarkup(
  createElement(PayrollRecordsTable, {
    records: [
      {
        id: "payroll-1",
        companyId: "company-demo",
        employeeId: "emp-1",
        employeeName: "张三",
        period: "2026-05",
        grossSalary: 12000,
        socialSecurityEmployee: 1200,
        socialSecurityEmployer: 2400,
        housingFundEmployee: 600,
        housingFundEmployer: 600,
        iitWithheld: 300,
        netPay: 9900,
        status: "draft",
        confirmedAt: null,
        confirmedByUserId: null,
        confirmedByName: "",
        notes: "",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ],
    formatAmount: (value: number) => value.toFixed(2),
    getStatusLabel: (status: string) => status,
    getStatusColor: () => "#333",
    onConfirm: () => {},
    cellStyle: () => ({ borderBottom: "1px solid #eee", padding: "8px", textAlign: "left" as const })
  })
);

assert(recordsTableHtml.includes("张三"), "expected payroll record row");
assert(recordsTableHtml.includes("合计"), "expected payroll totals row");

const policyFormHtml = renderToStaticMarkup(
  createElement(PayrollPolicyForm, {
    editing: false,
    form: {
      socialSecurityBaseMin: "3000",
      socialSecurityBaseMax: "30000",
      pensionEmployeeRate: "0.08",
      pensionEmployerRate: "0.16",
      medicalEmployeeRate: "0.02",
      medicalEmployerRate: "0.09",
      unemploymentEmployeeRate: "0.005",
      unemploymentEmployerRate: "0.005",
      housingFundEmployeeRate: "0.07",
      housingFundEmployerRate: "0.07",
      iitThreshold: "5000"
    },
    onChange: () => {},
    onStartEdit: () => {},
    onSave: () => {},
    onCancel: () => {},
    formatAmount: (value: number) => value.toFixed(2),
    formatPercent: (value: number) => `${(value * 100).toFixed(1)}%`
  })
);

assert(policyFormHtml.includes("社保/公积金/个税参数"), "expected policy form title");
assert(policyFormHtml.includes("编辑参数"), "expected policy edit button");
