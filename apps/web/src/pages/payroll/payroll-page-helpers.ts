import type { PayrollPolicy } from "@finance-taxation/domain-model";

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: "在职",
  on_leave: "休假",
  resigned: "已离职"
};

export const PAYROLL_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  confirmed: "已确认"
};

export const PAYROLL_STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  confirmed: "#1a7f5a"
};

export function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

export function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function btnPrimary() {
  return {
    background: "#1e2a37", color: "#fff", border: "none",
    borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontSize: "13px"
  } as const;
}

export function btnSecondary() {
  return {
    background: "#eef0f3", color: "#1e2a37", border: "none",
    borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px"
  } as const;
}

export function fmt(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export const EMPTY_EMP_FORM = {
  name: "", idCard: "", position: "", hireDate: "", baseSalary: "", notes: ""
};

export type PayrollEmployeeFormState = typeof EMPTY_EMP_FORM;

export function normalizePayrollNavState(state: unknown) {
  if (!state || typeof state !== "object") {
    return {};
  }
  const source = state as Record<string, unknown>;
  const pick = (key: string) => typeof source[key] === "string" ? source[key] : undefined;
  return {
    businessEventId: pick("businessEventId"),
    employeeId: pick("employeeId"),
    payrollPeriod: pick("payrollPeriod"),
    tab: pick("tab"),
    resourceType: pick("resourceType"),
    resourceId: pick("resourceId")
  };
}

export function buildPayrollNavigationState(
  period: string,
  businessEventId: string,
  extra?: Record<string, string>
) {
  return {
    payrollPeriod: period,
    businessEventId,
    ...extra
  };
}

export function isPayrollPolicyMissingError(error: unknown) {
  return error instanceof Error && error.message === "Payroll policy not configured";
}

export function policyToForm(p: PayrollPolicy): Record<string, string> {
  return {
    socialSecurityBaseMin: String(p.socialSecurityBaseMin),
    socialSecurityBaseMax: String(p.socialSecurityBaseMax),
    pensionEmployeeRate: String(p.pensionEmployeeRate),
    pensionEmployerRate: String(p.pensionEmployerRate),
    medicalEmployeeRate: String(p.medicalEmployeeRate),
    medicalEmployerRate: String(p.medicalEmployerRate),
    unemploymentEmployeeRate: String(p.unemploymentEmployeeRate),
    unemploymentEmployerRate: String(p.unemploymentEmployerRate),
    housingFundEmployeeRate: String(p.housingFundEmployeeRate),
    housingFundEmployerRate: String(p.housingFundEmployerRate),
    iitThreshold: String(p.iitThreshold)
  };
}
