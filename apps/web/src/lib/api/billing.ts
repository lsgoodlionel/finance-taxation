/**
 * 订阅计费与申报到期 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── P8 订阅计费 ──────────────────────────────────────────────────────────────

export interface BillingPlan {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  limits: { seats: number; employees: number; aiCallsPerMonth: number; bankAccounts: number };
  features: string[];
  highlight: string;
}

export interface QuotaCheck { key: string; limit: number; used: number; remaining: number; allowed: boolean; exceeded: boolean }

export interface SubscriptionInfo {
  subscription: { planCode: string; status: string; billingCycle: string; currentPeriodStart: string; currentPeriodEnd: string; trialEnd: string | null };
  plan: (BillingPlan) | null;
  usage: { seats: number; employees: number; aiCallsPerMonth: number; bankAccounts: number };
  quotas: Record<string, QuotaCheck> | null;
}

export async function listBillingPlans() {
  return request<{ items: BillingPlan[] }>("/api/billing/plans");
}
export async function getSubscription() {
  return request<SubscriptionInfo>("/api/billing/subscription");
}
export async function subscribePlan(planCode: string, billingCycle: "monthly" | "yearly", method?: string) {
  return request<{ ok: boolean; activated?: boolean; paymentId?: string; amount: number; payInstruction?: string }>(
    "/api/billing/subscribe", { method: "POST", body: JSON.stringify({ planCode, billingCycle, method }) });
}
export async function confirmBillingPayment(paymentId: string, reference: string) {
  return request<{ ok: boolean; activated: boolean; planCode: string }>(
    `/api/billing/payments/${paymentId}/confirm`, { method: "POST", body: JSON.stringify({ reference }) });
}
export async function listBillingPayments() {
  return request<{ items: { id: string; plan_code: string; billing_cycle: string; amount: string; method: string; status: string; reference: string; paid_at: string | null; created_at: string }[]; total: number }>("/api/billing/payments");
}

// ── P7 申报到期 ──────────────────────────────────────────────────────────────

export interface TaxDeadline {
  taxType: string;
  label: string;
  dueDate: string;
  daysLeft: number;
  filed: boolean;
  urgent: boolean;
}

export async function getTaxDeadlines(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ period: string; deadlines: TaxDeadline[]; urgentCount: number }>(`/api/tax/deadlines${q}`);
}
