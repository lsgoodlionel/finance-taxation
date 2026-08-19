/**
 * 银企直连的前端接口（V14-A）。
 *
 * 单独一个文件而不是塞进 `api-expense-control.ts`：银企是另一条链路
 * （配置在系统设置、指令在付款页），混在一起会让两边都变得难找。
 */

import { request } from "./api";

export interface BankProviderMeta {
  id: string;
  name: string;
  defaultSignAlgorithm: "RSA" | "SM2";
  certHint: string;
  docsUrl: string;
}

export interface BankConnectConfig {
  id: string;
  provider: string;
  displayName: string;
  payerAccount: string;
  customerNo: string;
  endpoint: string;
  signAlgorithm: "RSA" | "SM2";
  certRef: string;
  /** 证书密码永不回显，只告诉前台设没设过。 */
  hasCertPassword: boolean;
  certFingerprint: string | null;
  certExpiresOn: string | null;
  enabled: boolean;
  /** 该 provider 是否已有适配器实现。 */
  isProviderAvailable: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestMsg: string | null;
  note: string | null;
}

export type BankInstructionStatus =
  | "pending"
  | "accepted"
  | "processing"
  | "succeeded"
  | "failed"
  | "unknown";

export interface BankTransferInstruction {
  id: string;
  paymentId: string;
  paymentNo: string;
  configId: string;
  configName: string;
  clientRef: string;
  bankRef: string | null;
  amountCents: number;
  payeeAccount: string;
  payeeName: string;
  status: BankInstructionStatus;
  message: string | null;
  submittedAt: string | null;
  lastCheckedAt: string | null;
}

export async function listBankConnectConfigs() {
  return request<{
    items: BankConnectConfig[];
    providers: BankProviderMeta[];
    implemented: string[];
  }>("/api/bank-connect/configs");
}

export interface SaveBankConfigBody {
  id?: string;
  provider: string;
  displayName: string;
  payerAccount: string;
  customerNo: string;
  endpoint: string;
  signAlgorithm: "RSA" | "SM2";
  certRef: string;
  /** **不传就是不改**。编辑时留空表示保持原密码。 */
  certPassword?: string;
  certFingerprint?: string | null;
  certExpiresOn?: string | null;
  enabled: boolean;
  note?: string | null;
}

export async function saveBankConnectConfig(body: SaveBankConfigBody) {
  return request<{ config: BankConnectConfig }>("/api/bank-connect/configs", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function deleteBankConnectConfig(id: string) {
  return request<{ id: string }>(`/api/bank-connect/configs/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

/** 连通性测试。**不动资金**，只验凭据。 */
export async function testBankConnectConfig(id: string) {
  return request<{ ok: boolean; message: string }>(
    `/api/bank-connect/configs/${encodeURIComponent(id)}/test`,
    { method: "POST" }
  );
}

export async function getBankConnectBalance(id: string) {
  return request<{ availableCents: number; currency: string; asOf: string }>(
    `/api/bank-connect/configs/${encodeURIComponent(id)}/balance`
  );
}

export async function listBankInstructions(params: { paymentId?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.paymentId) qs.set("paymentId", params.paymentId);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: BankTransferInstruction[]; total: number }>(
    `/api/bank-connect/instructions${suffix}`
  );
}

export async function submitBankInstruction(body: { paymentId: string; configId: string }) {
  return request<{ instruction: BankTransferInstruction }>("/api/bank-connect/instructions", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function refreshBankInstruction(id: string) {
  return request<{ instruction: BankTransferInstruction }>(
    `/api/bank-connect/instructions/${encodeURIComponent(id)}/refresh`,
    { method: "POST" }
  );
}
