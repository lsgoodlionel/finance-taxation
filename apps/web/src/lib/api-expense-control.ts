/**
 * 费控领域的 API 客户端（V13-A）。
 *
 * 独立成模块而不是并进 `api.ts`：那个文件已近 3000 行，远超仓库约定的单文件
 * 上限。鉴权与错误归一仍复用 `api.ts` 的 `request`——各自实现一遍 fetch 包装
 * 会让 token 刷新与 401 处理立刻分叉。
 */

import { request } from "./api";

export type BudgetPeriodType = "month" | "quarter" | "year";
export type BudgetControlPolicy = "block" | "warn";
export type ControlLevel = "ok" | "warn" | "escalate" | "block";

export interface BudgetWithUsage {
  id: string;
  periodType: BudgetPeriodType;
  periodKey: string;
  costCenterId: string | null;
  accountCode: string | null;
  amountCents: number;
  controlPolicy: BudgetControlPolicy;
  note: string | null;
  /** 已占用：审批通过但尚未落账的单据合计。 */
  encumberedCents: number;
  /** 已实际发生：已落账的金额。 */
  actualCents: number;
  /** 可用额度，**可能为负**——超支照实显示，不置零。 */
  availableCents: number;
}

export interface BudgetCheckItem {
  budgetId: string;
  periodKey: string;
  costCenterId: string | null;
  accountCode: string | null;
  level: ControlLevel;
  code: string;
  message: string;
  availableCents: number;
  remainingCents: number;
  overrunCents: number;
}

export async function listBudgets(period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ items: BudgetWithUsage[]; total: number }>(`/api/budgets${qs}`);
}

export interface CreateBudgetBody {
  periodType: BudgetPeriodType;
  periodKey: string;
  costCenterId?: string | null;
  accountCode?: string | null;
  amountCents: number;
  controlPolicy?: BudgetControlPolicy;
  note?: string | null;
}

export async function createBudget(body: CreateBudgetBody) {
  return request<{ budget: BudgetWithUsage }>("/api/budgets", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function updateBudget(
  id: string,
  body: { amountCents?: number; controlPolicy?: BudgetControlPolicy }
) {
  return request<{ budget: BudgetWithUsage }>(`/api/budgets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function deleteBudget(id: string) {
  return request<{ ok: true }>(`/api/budgets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * 预检一笔支出。
 *
 * 返回**全部**适用预算各自的判定——一笔支出可能同时受部门预算与公司总预算
 * 约束，只给一个结论会丢掉「哪一条不够」这个信息。`level` 是收敛后的最严厉级别。
 */
export async function checkBudget(body: {
  date: string;
  accountCode: string;
  costCenterId?: string | null;
  amountCents: number;
}) {
  return request<{ level: ControlLevel; checks: BudgetCheckItem[]; total: number }>(
    "/api/budgets/check",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export type ExpenseLimitBasis = "per_day" | "per_time" | "per_month";
export type ExpenseOverPolicy = "block" | "warn" | "escalate";

export interface ExpenseStandard {
  id: string;
  expenseType: string;
  gradeCode: string | null;
  cityTier: string | null;
  limitCents: number;
  limitBasis: ExpenseLimitBasis;
  overPolicy: ExpenseOverPolicy;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export async function listExpenseStandards(type?: string) {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  return request<{ items: ExpenseStandard[]; total: number }>(`/api/expense-standards${qs}`);
}

export async function createExpenseStandard(body: {
  expenseType: string;
  gradeCode?: string | null;
  cityTier?: string | null;
  limitCents: number;
  limitBasis: ExpenseLimitBasis;
  overPolicy?: ExpenseOverPolicy;
  effectiveFrom: string;
  effectiveTo?: string | null;
  note?: string | null;
}) {
  return request<{ standard: ExpenseStandard }>("/api/expense-standards", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** 给标准设置止日（停用）。没有删除接口——历史单据要按当时的标准解释。 */
export async function expireExpenseStandard(id: string, effectiveTo: string) {
  return request<{ standard: ExpenseStandard }>(
    `/api/expense-standards/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ effectiveTo }) }
  );
}

export async function checkExpenseStandard(body: {
  expenseType: string;
  onDate: string;
  actualCents: number;
  quantity?: number;
  gradeCode?: string | null;
  cityTier?: string | null;
}) {
  return request<{
    level: ControlLevel;
    code: string;
    message: string;
    limitCents: number | null;
    overrunCents: number;
    standardId: string | null;
  }>("/api/expense-standards/check", { method: "POST", body: JSON.stringify(body) });
}

// ── 审批流（V13-A4/A5/A6）──────────────────────────────────────────

export type ApprovalDocumentType =
  | "request"
  | "advance"
  | "reimbursement"
  | "payment"
  | "contract";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApproverType = "role" | "user" | "manager";

export interface ApprovalStep {
  stepOrder: number;
  approverType: ApproverType;
  approverValue: string;
  /** 触发本步骤的最小金额（分）。达到即触发。 */
  minAmountCents: number;
}

export interface ApprovalFlow {
  id: string;
  name: string;
  documentType: ApprovalDocumentType;
  isActive: boolean;
  note: string | null;
  steps: ApprovalStep[];
}

export interface ApprovalInstance {
  id: string;
  flowId: string;
  documentType: ApprovalDocumentType;
  documentId: string;
  submitterUserId: string;
  status: ApprovalStatus;
  currentStepOrder: number | null;
  requiredStepOrders: number[];
  amountCents: number;
}

export interface ApprovalActionRecord {
  step_order: number;
  actor_user_id: string;
  action: string;
  comment: string | null;
  acted_at: string;
}

export async function listApprovalFlows() {
  return request<{ items: ApprovalFlow[]; total: number }>("/api/approval/flows");
}

export async function createApprovalFlow(body: {
  name: string;
  documentType: ApprovalDocumentType;
  steps: Array<Omit<ApprovalStep, "stepOrder">>;
  note?: string | null;
}) {
  return request<{ flow: ApprovalFlow }>("/api/approval/flows", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** 我的待办审批。 */
export async function listPendingApprovals() {
  return request<{ items: ApprovalInstance[]; total: number }>("/api/approval/pending");
}

export async function actOnApproval(
  id: string,
  body: { action: "approve" | "reject" | "cancel"; comment?: string | null }
) {
  return request<{ instance: ApprovalInstance }>(
    `/api/approval/instances/${encodeURIComponent(id)}/act`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function getApprovalHistory(id: string) {
  return request<{ actions: ApprovalActionRecord[]; total: number }>(
    `/api/approval/instances/${encodeURIComponent(id)}`
  );
}
