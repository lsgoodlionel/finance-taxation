import type { Employee } from "@finance-taxation/domain-model";
import { PayrollEmployeeForm } from "./PayrollEmployeeForm";
import { PayrollEmployeesSection } from "./PayrollEmployeesSection";
import { PayrollEmployeesTable } from "./PayrollEmployeesTable";
import {
  EMPLOYEE_STATUS_LABELS,
  btnPrimary,
  cellStyle,
  fmt,
  type PayrollEmployeeFormState
} from "./payroll-page-helpers";

export interface PayrollEmployeesTabPanelProps {
  employees: Employee[];
  navEmployeeId: string | null;
  showEmpForm: boolean;
  editingEmp: Employee | null;
  empForm: PayrollEmployeeFormState;
  onEmpFormChange: (form: PayrollEmployeeFormState) => void;
  onToggleForm: () => void;
  onCancelForm: () => void;
  onCreateEmployee: () => Promise<void>;
  onUpdateEmployee: () => Promise<void>;
  onEditEmployee: (emp: Employee) => void;
}

export function PayrollEmployeesTabPanel({
  employees,
  navEmployeeId,
  showEmpForm,
  editingEmp,
  empForm,
  onEmpFormChange,
  onToggleForm,
  onCancelForm,
  onCreateEmployee,
  onUpdateEmployee,
  onEditEmployee
}: PayrollEmployeesTabPanelProps) {
  return (
    <PayrollEmployeesSection
      toolbar={(
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button style={btnPrimary()} onClick={onToggleForm}>
            + 添加员工
          </button>
        </div>
      )}
      form={(showEmpForm || editingEmp) ? (
        <PayrollEmployeeForm
          editingName={editingEmp?.name}
          form={empForm}
          onChange={onEmpFormChange}
          onSubmit={editingEmp ? onUpdateEmployee : onCreateEmployee}
          onCancel={onCancelForm}
          primaryLabel={editingEmp ? "保存修改" : "确认添加"}
        />
      ) : undefined}
      list={(
        <PayrollEmployeesTable
          employees={employees}
          navEmployeeId={navEmployeeId}
          employeeStatusLabels={EMPLOYEE_STATUS_LABELS}
          formatAmount={fmt}
          onEdit={onEditEmployee}
          cellStyle={cellStyle}
        />
      )}
    />
  );
}
