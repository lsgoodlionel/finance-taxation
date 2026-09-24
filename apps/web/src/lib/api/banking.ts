/**
 * 银行账户与流水 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  getStoredToken,
  request
} from "./client";

// ─── P1: Bank Accounts & Statements ─────────────────────────────────────────

export interface BankAccount {
  id: string;
  bank_name: string;
  bank_code: string | null;
  account_no: string;
  account_name: string;
  currency: string;
  is_primary: boolean;
  is_payroll: boolean;
  notes: string;
  created_at: string;
}

export interface BankStatement {
  id: string;
  transaction_date: string;
  value_date: string | null;
  amount: number;
  balance: number | null;
  counterparty_name: string | null;
  counterparty_no: string | null;
  description: string | null;
  match_status: "unmatched" | "auto" | "manual" | "excluded";
  matched_voucher_id: string | null;
  matched_event_id: string | null;
  transaction_ref: string | null;
  imported_at: string;
}

export async function listBankAccounts() {
  return request<{ items: BankAccount[]; total: number }>("/api/banking/accounts");
}

export async function createBankAccount(data: {
  bankName: string; bankCode?: string; accountNo: string; accountName: string;
  currency?: string; isPrimary?: boolean; isPayroll?: boolean; notes?: string;
}) {
  return request<{ id: string; ok: boolean }>("/api/banking/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listBankStatements(params?: {
  dateFrom?: string; dateTo?: string; matchStatus?: string; page?: number; pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.dateFrom)    q.set("date_from", params.dateFrom);
  if (params?.dateTo)      q.set("date_to", params.dateTo);
  if (params?.matchStatus) q.set("match_status", params.matchStatus);
  if (params?.page)        q.set("page", String(params.page));
  if (params?.pageSize)    q.set("page_size", String(params.pageSize));
  const qs = q.toString();
  return request<{ items: BankStatement[]; total: number; page: number; pageSize: number }>(
    `/api/banking/statements${qs ? "?" + qs : ""}`,
  );
}

export async function importBankStatements(csvText: string, accountId?: string) {
  const token = getStoredToken();
  const url = accountId
    ? `/api/banking/statements/import?account_id=${encodeURIComponent(accountId)}`
    : "/api/banking/statements/import";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8", Authorization: `Bearer ${token ?? ""}` },
    body: csvText,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "导入失败" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{
    ok: boolean; detectedFormat: string; totalRows: number;
    inserted: number; skipped: number; errorRows: number; importBatch: string;
  }>;
}

export async function getBankUnmatchedSummary() {
  return request<Record<string, { count: number; totalAmount: number }>>("/api/banking/statements/unmatched");
}

export async function matchBankStatement(id: string, data: {
  voucherId?: string; eventId?: string; matchStatus?: string;
}) {
  return request<{ ok: boolean }>(`/api/banking/statements/${id}/match`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
