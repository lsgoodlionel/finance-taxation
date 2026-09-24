/**
 * 合同 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import type {
  Contract,
  ContractWithEventCount,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";
import {
  request
} from "./client";

// ─── Contracts ───────────────────────────────────────────────────────────────

export async function listContracts(filters?: { contractType?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.contractType) params.set("contractType", filters.contractType);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return request<{ items: ContractWithEventCount[]; total: number }>(
    qs ? `/api/contracts?${qs}` : "/api/contracts"
  );
}

export async function createContract(data: {
  contractNo?: string;
  contractType: string;
  title: string;
  counterpartyName: string;
  counterpartyType?: string;
  amount?: number;
  currency?: string;
  signedDate?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}) {
  return request<{ contract: Contract }>("/api/contracts", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function getContractDetail(contractId: string) {
  return request<{
    contract: Contract;
    relatedEvents: { id: string; title: string; status: string; createdAt: string }[];
    relatedTasks: Task[];
    relatedDocuments: GeneratedDocument[];
    relatedTaxItems: TaxItem[];
    relatedVouchers: Voucher[];
  }>(`/api/contracts/${contractId}`);
}

export async function updateContract(
  contractId: string,
  data: Partial<{
    title: string;
    counterpartyName: string;
    counterpartyType: string;
    amount: number;
    currency: string;
    signedDate: string;
    startDate: string;
    endDate: string;
    status: string;
    notes: string;
  }>
) {
  return request<{ contract: Contract }>(`/api/contracts/${contractId}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function closeContract(contractId: string, status: "fulfilled" | "terminated") {
  return request<{ contract: Contract }>(`/api/contracts/${contractId}/close`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}
