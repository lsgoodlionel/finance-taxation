import { useState } from "react";
import type { Employee } from "@finance-taxation/domain-model";
import { createEmployee, listEmployees, updateEmployee } from "../../lib/api";
import { EMPTY_EMP_FORM, type PayrollEmployeeFormState } from "./payroll-page-helpers";

export interface PayrollEmployeesState {
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  showEmpForm: boolean;
  setShowEmpForm: (show: boolean) => void;
  editingEmp: Employee | null;
  setEditingEmp: (employee: Employee | null) => void;
  empForm: PayrollEmployeeFormState;
  setEmpForm: (form: PayrollEmployeeFormState) => void;
  handleCreateEmployee: () => Promise<void>;
  handleUpdateEmployee: () => Promise<void>;
  startEditEmployee: (emp: Employee) => void;
}

export function usePayrollEmployeesState(setMessage: (message: string) => void): PayrollEmployeesState {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ ...EMPTY_EMP_FORM });

  async function handleCreateEmployee() {
    if (!empForm.name) { setMessage("姓名不能为空"); return; }
    const baseSalary = Number(empForm.baseSalary);
    if (isNaN(baseSalary) || baseSalary < 0) { setMessage("基本工资格式不正确"); return; }
    await createEmployee({
      name: empForm.name,
      idCard: empForm.idCard || undefined,
      position: empForm.position || undefined,
      hireDate: empForm.hireDate || undefined,
      baseSalary,
      notes: empForm.notes || undefined
    });
    setShowEmpForm(false);
    setEmpForm({ ...EMPTY_EMP_FORM });
    const res = await listEmployees();
    setEmployees(res.items);
    setMessage("员工已添加。");
  }

  async function handleUpdateEmployee() {
    if (!editingEmp) return;
    const baseSalary = Number(empForm.baseSalary);
    if (isNaN(baseSalary) || baseSalary < 0) { setMessage("基本工资格式不正确"); return; }
    await updateEmployee(editingEmp.id, {
      name: empForm.name,
      idCard: empForm.idCard,
      position: empForm.position,
      hireDate: empForm.hireDate || undefined,
      baseSalary
    });
    setEditingEmp(null);
    setEmpForm({ ...EMPTY_EMP_FORM });
    const res = await listEmployees();
    setEmployees(res.items);
    setMessage("员工信息已更新。");
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      idCard: emp.idCard,
      position: emp.position,
      hireDate: emp.hireDate ?? "",
      baseSalary: String(emp.baseSalary),
      notes: emp.notes
    });
    setShowEmpForm(false);
  }

  return {
    employees,
    setEmployees,
    showEmpForm,
    setShowEmpForm,
    editingEmp,
    setEditingEmp,
    empForm,
    setEmpForm,
    handleCreateEmployee,
    handleUpdateEmployee,
    startEditEmployee
  };
}
