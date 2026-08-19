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

// ── 申请单（V13-B1/B2）────────────────────────────────────────────

export type RequestType = "travel" | "procurement" | "payment" | "other";
export type RequestStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface RequestRow {
  id: string;
  requestNo: string;
  requestType: RequestType;
  title: string;
  purpose: string;
  amountCents: number;
  currency: string;
  costCenterId: string | null;
  accountCode: string | null;
  expectedDate: string;
  status: RequestStatus;
  requesterUserId: string;
  businessEventId: string | null;
  note: string | null;
}

export async function listRequests(params: { mine?: boolean; status?: RequestStatus } = {}) {
  const qs = new URLSearchParams();
  if (params.mine) qs.set("mine", "true");
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: RequestRow[]; total: number }>(`/api/requests${suffix}`);
}

export async function createRequest(body: {
  requestType: RequestType;
  title: string;
  purpose: string;
  amountCents: number;
  costCenterId?: string | null;
  accountCode?: string | null;
  expectedDate: string;
  note?: string | null;
}) {
  return request<{ request: RequestRow }>("/api/requests", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export type RequestAction = "submit" | "approve" | "reject" | "cancel" | "complete";

export async function transitionRequest(id: string, action: RequestAction) {
  return request<{ request: RequestRow }>(
    `/api/requests/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

/** 提交前看这单会不会超预算。返回全部适用预算各自的判定。 */
export async function precheckRequest(id: string) {
  return request<{
    level: ControlLevel;
    checks: BudgetCheckItem[];
    total?: number;
    note?: string;
  }>(`/api/requests/${encodeURIComponent(id)}/precheck`, { method: "POST" });
}

// ── 借款 / 备用金（V13-B3/B6）─────────────────────────────────────

export type AdvanceStatus = "draft" | "pending" | "approved" | "paid" | "settled" | "cancelled";

export interface AdvanceRow {
  id: string;
  advanceNo: string;
  requestId: string | null;
  borrowerUserId: string;
  counterpartyId: string;
  amountCents: number;
  purpose: string;
  expectedReturnDate: string | null;
  status: AdvanceStatus;
  paymentVoucherId: string | null;
  note: string | null;
  /** 未还余额，**来自账上**（1221 该往来单位的净额），不是表上的字段。 */
  outstandingCents: number;
}

export async function listAdvances(params: { mine?: boolean; status?: AdvanceStatus } = {}) {
  const qs = new URLSearchParams();
  if (params.mine) qs.set("mine", "true");
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: AdvanceRow[]; total: number }>(`/api/advances${suffix}`);
}

export async function createAdvance(body: {
  requestId?: string | null;
  amountCents: number;
  purpose: string;
  expectedReturnDate?: string | null;
  note?: string | null;
}) {
  return request<{ advance: AdvanceRow }>("/api/advances", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function transitionAdvance(id: string, action: string) {
  return request<{ advance: AdvanceRow }>(
    `/api/advances/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

// ── 报销单（V13-B4/B5/B7）────────────────────────────────────────

export type ReimbursementStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";

export interface ReimbursementAllocation {
  costCenterId: string;
  ratioBp: number;
  amountCents: number;
}

export interface ReimbursementLine {
  id: string;
  expenseType: string;
  accountCode: string;
  amountCents: number;
  quantity: number;
  invoiceId: string | null;
  summary: string;
  /** 费用发生地的城市等级（V13 残留 8）。在**行**上——一次出差可能跨城市。 */
  cityTier: string | null;
  allocations: ReimbursementAllocation[];
}

export interface ReimbursementRow {
  id: string;
  reimbursementNo: string;
  requestId: string | null;
  advanceId: string | null;
  applicantUserId: string;
  expenseDate: string;
  status: ReimbursementStatus;
  voucherId: string | null;
  note: string | null;
  lines: ReimbursementLine[];
  /** 明细合计，**算出来的**，服务端不存这个字段。 */
  totalCents: number;
}

export async function listReimbursements(
  params: { mine?: boolean; status?: ReimbursementStatus } = {}
) {
  const qs = new URLSearchParams();
  if (params.mine) qs.set("mine", "true");
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: ReimbursementRow[]; total: number }>(`/api/reimbursements${suffix}`);
}

export interface ReimbursementLineInput {
  expenseType: string;
  accountCode: string;
  amountCents: number;
  quantity?: number;
  invoiceId?: string | null;
  summary?: string;
  cityTier?: string | null;
  allocationsByRatio?: { costCenterId: string; ratioBp: number }[];
  allocationsByAmount?: { costCenterId: string; amountCents: number }[];
}

export async function createReimbursement(body: {
  requestId?: string | null;
  advanceId?: string | null;
  expenseDate: string;
  lines: ReimbursementLineInput[];
  note?: string | null;
}) {
  return request<{ reimbursement: ReimbursementRow }>("/api/reimbursements", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function transitionReimbursement(id: string, action: string) {
  return request<{ reimbursement: ReimbursementRow; note?: string }>(
    `/api/reimbursements/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

/** 这张发票报过没有（票据中心「转报销单」前先问一句）。 */
export async function checkInvoiceReimbursementUsage(invoiceId: string) {
  return request<{
    used: boolean;
    usages: { reimbursementId: string; reimbursementNo: string; status: string }[];
  }>(`/api/invoices/${encodeURIComponent(invoiceId)}/reimbursement-usage`);
}

// ── 合同付款计划与付款单（V13-C）─────────────────────────────────

export type PaymentScheduleType = "normal" | "retention";
export type PaymentScheduleStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";

export interface PaymentSchedule {
  id: string;
  contractId: string;
  periodNo: number;
  title: string;
  dueDate: string;
  amountCents: number;
  ratioBp: number | null;
  scheduleType: PaymentScheduleType;
  retentionReleaseDate: string | null;
  isCancelled: boolean;
  note: string | null;
  /** 已付，**由付款单汇总**，不是表上的字段。 */
  paidCents: number;
  status: PaymentScheduleStatus;
}

export interface ContractPaymentProgress {
  totalCents: number;
  paidCents: number;
  /** 待付**不含质保金**——它是约定延后的。 */
  unpaidCents: number;
  retentionCents: number;
  isFullyPaid: boolean;
  /** 主体款项付清，质保金可能还挂着。工程合同最常见的中间态。 */
  isMainPaid: boolean;
}

export async function listContractSchedules(contractId: string) {
  return request<{ items: PaymentSchedule[]; progress: ContractPaymentProgress }>(
    `/api/contracts/${encodeURIComponent(contractId)}/schedules`
  );
}

export async function createContractSchedule(
  contractId: string,
  body: {
    periodNo: number;
    title: string;
    dueDate: string;
    amountCents: number;
    ratioBp?: number | null;
    scheduleType?: PaymentScheduleType;
    retentionReleaseDate?: string | null;
    note?: string | null;
  }
) {
  return request<{ schedule: PaymentSchedule }>(
    `/api/contracts/${encodeURIComponent(contractId)}/schedules`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function cancelContractSchedule(scheduleId: string) {
  return request<{ ok: true }>(`/api/schedules/${encodeURIComponent(scheduleId)}/cancel`, {
    method: "POST"
  });
}

export interface DuePaymentRow {
  scheduleId: string;
  contractId: string;
  contractNo: string;
  counterpartyName: string;
  periodNo: number;
  title: string;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  scheduleType: PaymentScheduleType;
}

/** 应付列表。默认查本月——出纳每天要看的第一个东西。 */
export async function listDuePayments(params: { from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: DuePaymentRow[]; total: number; totalCents: number }>(
    `/api/payments/due${suffix}`
  );
}

export type PaymentStatus = "draft" | "submitted" | "paid" | "cancelled";

export interface PaymentRow {
  id: string;
  paymentNo: string;
  reimbursementId: string | null;
  scheduleId: string | null;
  amountCents: number;
  paidOn: string;
  bankAccountCode: string;
  status: PaymentStatus;
  voucherId: string | null;
  exportBatchNo: string | null;
  note: string | null;
}

export async function listPayments(params: { status?: PaymentStatus; from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: PaymentRow[]; total: number }>(`/api/payments${suffix}`);
}

export async function createPayment(body: {
  reimbursementId?: string | null;
  scheduleId?: string | null;
  amountCents: number;
  paidOn?: string;
  bankAccountCode?: string;
  note?: string | null;
}) {
  return request<{ payment: PaymentRow }>("/api/payments", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function confirmPayment(id: string) {
  return request<{ payment: PaymentRow; voucherId: string; note: string }>(
    `/api/payments/${encodeURIComponent(id)}/confirm`,
    { method: "POST" }
  );
}

// ── 业财合规审核与费用分析（V13-D）─────────────────────────────

export interface AuditFinding {
  /** 哪一行出的问题；null 表示单据级。 */
  lineId: string | null;
  level: ControlLevel;
  code: string;
  message: string;
}

export interface AuditOutcome {
  level: ControlLevel;
  findings: AuditFinding[];
}

/** 审核一张报销单。纯计算不落库，填完表就能看，不用等提交被拒。 */
export async function auditReimbursement(id: string) {
  return request<AuditOutcome>(`/api/reimbursements/${encodeURIComponent(id)}/audit`, {
    method: "POST"
  });
}

export interface ExpenseAnalysisRow {
  key: string;
  label: string;
  amountCents: number;
  count: number;
}

export interface ExpenseAnalysis {
  period: string;
  byCostCenter: ExpenseAnalysisRow[];
  byExpenseType: ExpenseAnalysisRow[];
  byApplicant: ExpenseAnalysisRow[];
  totalCents: number;
  /** 口径说明。数据源是报销单不是总账——不说明白两张表对不上时没人知道为什么。 */
  scopeNote: string;
}

export async function getExpenseAnalysis(period: string) {
  return request<ExpenseAnalysis>(
    `/api/reports/expense-analysis?period=${encodeURIComponent(period)}`
  );
}

/** 抄送给我的审批（V13 残留 4）。已结束的也返回——抄送是知会，不是待办。 */
export interface WatchedApproval extends ApprovalInstance {
  readAt: string | null;
}

export async function listWatchedApprovals() {
  return request<{ items: WatchedApproval[]; total: number; unread: number }>(
    "/api/approval/watched"
  );
}

export async function markWatchedRead(instanceId: string) {
  return request<{ ok: true }>(
    `/api/approval/watched/${encodeURIComponent(instanceId)}/read`,
    { method: "POST" }
  );
}

// ── 验收单与三单匹配（V13 残留 7 / 缺口 12、13）─────────────────

export type AcceptanceStatus = "draft" | "confirmed" | "cancelled";

export interface Acceptance {
  id: string;
  acceptanceNo: string;
  contractId: string;
  scheduleId: string | null;
  acceptedOn: string;
  amountCents: number;
  quantityNote: string;
  status: AcceptanceStatus;
  acceptedByUserId: string;
  note: string | null;
}

export async function listAcceptances(params: { contractId?: string; scheduleId?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.contractId) qs.set("contractId", params.contractId);
  if (params.scheduleId) qs.set("scheduleId", params.scheduleId);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: Acceptance[]; total: number }>(`/api/acceptances${suffix}`);
}

export async function createAcceptance(body: {
  contractId: string;
  scheduleId?: string | null;
  acceptedOn: string;
  amountCents: number;
  quantityNote?: string;
  note?: string | null;
}) {
  return request<{ acceptance: Acceptance }>("/api/acceptances", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function transitionAcceptance(id: string, action: "confirm" | "cancel") {
  return request<{ acceptance: Acceptance }>(
    `/api/acceptances/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

/**
 * 某期次的三单匹配（合同期次 × 验收 × 发票）。
 *
 * **一条都不 block**——三种不一致都有正当解释（预付款、先票后货、货到票未到）。
 * 价值在于让付款的人看见，而不是拦住他。
 */
export async function getScheduleThreeWay(scheduleId: string, amountCents: number) {
  return request<{ level: ControlLevel; findings: AuditFinding[]; total: number }>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/three-way?amountCents=${amountCents}`
  );
}
