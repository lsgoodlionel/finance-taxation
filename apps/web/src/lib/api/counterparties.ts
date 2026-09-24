/**
 * 往来单位与反馈 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── P7 往来单位 ──────────────────────────────────────────────────────────────

export interface Counterparty {
  id: string | null;
  name: string;
  category: string;
  taxNo: string;
  contactName: string;
  contactPhone: string;
  creditLimit: number;
  creditDays: number;
  riskLevel: string;
  notes: string;
  receivable: number;
  receivableCount: number;
  payable: number;
  payableCount: number;
  registered: boolean;
}

export async function listCounterparties() {
  return request<{ items: Counterparty[]; total: number }>("/api/counterparties");
}

export async function createCounterparty(data: Record<string, unknown>) {
  return request<{ id: string; ok: boolean }>("/api/counterparties", { method: "POST", body: JSON.stringify(data) });
}

export async function updateCounterparty(id: string, data: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/counterparties/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// ── 反馈与升级需求 ───────────────────────────────────────────────────────────

export interface FeedbackRow {
  id: string; user_name: string; category: string; title: string; content: string;
  module: string; status: string; votes: number; proposal_id: string | null; created_at: string;
}
export interface ProposalRow {
  id: string; title: string; summary: string; priority: string; source_count: number;
  status: string; decided_by_name: string; decided_at: string | null; decision_note: string; created_at: string;
}

export async function submitFeedback(data: { category: string; title: string; content?: string; module?: string }) {
  return request<{ id: string; ok: boolean }>("/api/feedback", { method: "POST", body: JSON.stringify(data) });
}
export async function listFeedback(status?: string) {
  const q = status ? `?status=${status}` : "";
  return request<{ items: FeedbackRow[]; total: number }>(`/api/feedback${q}`);
}
export async function consolidateFeedback() {
  return request<{ id: string; ok: boolean; title: string; priority: string; sourceCount: number }>(
    "/api/feedback/consolidate", { method: "POST", body: JSON.stringify({}) });
}
export async function listProposals() {
  return request<{ items: ProposalRow[]; total: number }>("/api/proposals");
}
export async function decideProposal(id: string, decision: string, note?: string) {
  return request<{ ok: boolean; decision: string }>(`/api/proposals/${id}/decide`, {
    method: "POST", body: JSON.stringify({ decision, note }) });
}
