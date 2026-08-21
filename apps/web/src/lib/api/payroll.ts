/**
 * 工资与代发 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import type {
  Employee,
  PayrollPeriodSummary,
  PayrollPolicy,
  PayrollRecord,
  PayrollTaxReviewLedger
} from "@finance-taxation/domain-model";
import {
  request
} from "./client";

// ─── Payroll ─────────────────────────────────────────────────────────────────

export async function listEmployees() {
  return request<{ items: Employee[]; total: number }>("/api/employees");
}

export async function createEmployee(data: {
  name: string;
  idCard?: string;
  position?: string;
  departmentId?: string;
  hireDate?: string;
  baseSalary: number;
  notes?: string;
}) {
  return request<{ employee: Employee }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateEmployee(
  employeeId: string,
  data: Partial<{
    name: string;
    idCard: string;
    position: string;
    departmentId: string;
    hireDate: string;
    leaveDate: string;
    baseSalary: number;
    status: string;
    notes: string;
  }>
) {
  return request<{ employee: Employee }>(`/api/employees/${employeeId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function getPayrollPolicy() {
  return request<{ policy: PayrollPolicy }>("/api/payroll/policy");
}

export async function updatePayrollPolicy(
  data: Partial<{
    socialSecurityBaseMin: number;
    socialSecurityBaseMax: number;
    pensionEmployeeRate: number;
    pensionEmployerRate: number;
    medicalEmployeeRate: number;
    medicalEmployerRate: number;
    unemploymentEmployeeRate: number;
    unemploymentEmployerRate: number;
    housingFundEmployeeRate: number;
    housingFundEmployerRate: number;
    iitThreshold: number;
  }>
) {
  return request<{ policy: PayrollPolicy }>("/api/payroll/policy", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function getPayrollPeriods() {
  return request<{ items: PayrollPeriodSummary[]; total: number }>("/api/payroll/periods");
}

export async function computePayroll(period: string) {
  return request<{ records: PayrollRecord[]; period: string }>("/api/payroll/compute", {
    method: "POST",
    body: JSON.stringify({ period })
  });
}

export async function listPayroll(period: string) {
  return request<{ items: PayrollRecord[]; total: number }>(`/api/payroll?period=${encodeURIComponent(period)}`);
}

export async function listPayrollReviewLedgers(period: string) {
  return request<{ items: PayrollTaxReviewLedger[]; total: number }>(
    `/api/payroll/review-ledgers?period=${encodeURIComponent(period)}`
  );
}

export async function syncPayrollReviewLedgers(input: { period: string; businessEventId?: string | null }) {
  return request<{ items: PayrollTaxReviewLedger[]; total: number }>("/api/payroll/review-ledgers", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function confirmPayroll(recordId: string) {
  return request<{ record: PayrollRecord }>(`/api/payroll/${recordId}/confirm`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function updateSalaryAccounts(
  items: { employeeId: string; salaryAccount?: string; salaryBank?: string }[]
) {
  return request<{ ok: boolean; updated: number }>("/api/payroll/employees/salary-accounts", {
    method: "PATCH",
    body: JSON.stringify({ items })
  });
}

// ── P3 工资代发 ───────────────────────────────────────────────────────────────

export interface PayrollTransferBatch {
  id: string;
  payroll_period: string;
  total_amount: string;
  employee_count: number;
  status: "draft" | "approved" | "exported" | "disbursed" | "confirmed";
  retry_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  compensation_status: "not_required" | "pending" | "completed" | "failed";
  compensation_event_id: string | null;
  compensated_at: string | null;
  bank_transfer_ref: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollTransferLine {
  id: string;
  employee_id: string;
  employee_name: string;
  salary_account: string;
  salary_bank: string;
  amount: string;
  status: "normal" | "skipped";
}

export async function listTransferBatches() {
  return request<{ items: PayrollTransferBatch[]; total: number }>("/api/payroll/transfer/batches");
}

export async function getTransferBatch(batchId: string) {
  return request<{ batch: PayrollTransferBatch; lines: PayrollTransferLine[] }>(
    `/api/payroll/transfer/batches/${batchId}`
  );
}

export async function buildTransferBatch(period: string, bankAccountId?: string) {
  return request<{ ok: boolean; batchId: string; employeeCount: number; totalAmount: number; skipped: number }>(
    "/api/payroll/transfer/batches",
    { method: "POST", body: JSON.stringify({ period, bankAccountId }) }
  );
}

export async function approveTransferBatch(batchId: string) {
  return request<{ ok: boolean }>(`/api/payroll/transfer/batches/${batchId}/approve`, {
    method: "POST", body: JSON.stringify({})
  });
}

/**
 * 通过银企接口直接提交代发（V15 补入口）。
 *
 * 与「导出 CSV 再去网银导入」二选一：接了银企直连的公司走这条，
 * 成功后批次直接标记已代发并联动经营事项。
 *
 * 后端 `POST .../submit-api` 从 V13 起就在，一直没有前台入口——
 * 于是配好了银企直连的公司，仍然只能导出 CSV 手工上传。
 */
export async function submitTransferBatchViaApi(batchId: string) {
  return request<{
    ok: boolean;
    provider: string;
    bankTransferRef: string | null;
    message: string;
    eventId: string;
  }>(`/api/payroll/transfer/batches/${encodeURIComponent(batchId)}/submit-api`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function disburseTransferBatch(batchId: string, bankTransferRef?: string) {
  return request<{ ok: boolean; eventId: string }>(`/api/payroll/transfer/batches/${batchId}/disburse`, {
    method: "POST", body: JSON.stringify({ bankTransferRef })
  });
}

export async function compensateTransferBatch(batchId: string) {
  return request<{ ok: boolean; eventId: string; reused: boolean }>(
    `/api/payroll/transfer/batches/${batchId}/compensate`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function downloadTransferFile(batchId: string, format: "generic" | "cmb") {
  const token = window.localStorage.getItem("finance-taxation-v2-token") ?? "";
  const base = import.meta.env?.VITE_API_BASE_URL || "http://127.0.0.1:3100";
  const resp = await fetch(`${base}/api/payroll/transfer/batches/${batchId}/file?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`导出失败 HTTP ${resp.status}`);
  return resp.blob();
}
