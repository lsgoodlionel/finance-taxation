import React from "react";
import type { Employee } from "@finance-taxation/domain-model";

type PayrollEmployeesTableProps = {
  employees: Employee[];
  navEmployeeId: string | null;
  employeeStatusLabels: Record<string, string>;
  formatAmount: (value: number) => string;
  onEdit: (employee: Employee) => void;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
    verticalAlign: "top";
  };
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return value.slice(0, 10);
}

export function PayrollEmployeesTable({
  employees,
  navEmployeeId,
  employeeStatusLabels,
  formatAmount,
  onEdit,
  cellStyle
}: PayrollEmployeesTableProps) {
  return (
    <div style={{ background: "rgba(255,255,255,0.82)", borderRadius: "24px", border: "1px solid rgba(20,40,60,0.08)", padding: "24px" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ color: "#6c7a89" }}>
            {["姓名", "职位", "入职日期", "基本工资", "状态", "操作"].map((header) => (
              <th key={header} style={{ ...cellStyle(), fontWeight: 500, whiteSpace: "nowrap" }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...cellStyle(), color: "#aab5c0", textAlign: "center", padding: "32px" }}>
                暂无员工数据，点击"添加员工"开始录入
              </td>
            </tr>
          ) : (
            employees.map((employee) => {
              const highlighted = navEmployeeId === employee.id;
              return (
                <tr key={employee.id}>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "160px" }}>
                    <div>{employee.name}</div>
                    <div style={{ color: "#8a9bb0", fontSize: "11px" }}>{employee.idCard}</div>
                  </td>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "110px" }}>{employee.position || "—"}</td>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "120px", whiteSpace: "nowrap" }}>{formatDate(employee.hireDate)}</td>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "110px", whiteSpace: "nowrap" }}>¥ {formatAmount(employee.baseSalary)}</td>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "90px", whiteSpace: "nowrap" }}>
                    <span style={{ background: employee.status === "active" ? "#1a7f5a22" : "#8a9bb022", color: employee.status === "active" ? "#1a7f5a" : "#8a9bb0", borderRadius: "999px", padding: "2px 10px", fontSize: "12px" }}>
                      {employeeStatusLabels[employee.status] ?? employee.status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle(), background: highlighted ? "rgba(79,142,247,0.08)" : undefined, minWidth: "88px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => onEdit(employee)}
                      style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1e2a37", color: "#1e2a37", background: "none", cursor: "pointer" }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              );
            })
        )}
      </tbody>
      </table>
      </div>
    </div>
  );
}
