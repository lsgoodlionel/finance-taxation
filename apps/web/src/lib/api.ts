/**
 * 前端 API 门面。
 *
 * V15/P2：这个文件曾有 3000 多行，是全仓改动最频繁、冲突最多的地方。
 * 核心层现在在 `api/client.ts`，按业务切分的领域接口在 `api/*.ts`，
 * 这里再导出它们——**既有的 `from "../lib/api"` 一行都不用改**。
 *
 * 这里还留着一段中枢业务接口（事项 / 任务 / 凭证 / 单据 / 总账 / 报表 / 税务），
 * 它们跨领域互相引用，硬切会造出一堆循环依赖。等各自领域稳定下来再动。
 *
 * **新增接口请加到对应的 `api/<领域>.ts`，不要再往这里堆。**
 */
export * from "./api/client";
export * from "./api/contracts";
export * from "./api/payroll";
export * from "./api/billing";
export * from "./api/counterparties";
export * from "./api/archive";
export * from "./api/workspace";
export * from "./api/social-security";
export * from "./api/knowledge";
export * from "./api/settings";
export * from "./api/tax-integration";
export * from "./api/banking";
export * from "./api/invoices";
export * from "./api/integrations";
export * from "./api/intelligence";
export * from "./api/assets";
export * from "./api/cost-and-rates";

import type {
  BalanceSheetReport,
  BusinessEvent,
  CashFlowReport,
  ChartAccount,
  ChairmanReportSummary,
  ClosingPackageExport,
  CorporateIncomeTaxPreparation,
  ExportArchiveEntry,
  ExportArtifactKind,
  ExportJob,
  GeneratedDocument,
  LedgerEntry,
  LedgerPostingBatch,
  MenuNode,
  ProfitStatementReport,
  ReportDiffResult,
  ReportSnapshot,
  RiskClosureRecord,
  RiskFinding,
  RndProject,
  RndProjectSummary,
  IndividualIncomeTaxMaterial,
  StampAndSurtaxSummary,
  SuperDeductionPackage,
  Task,
  TaxFilingBatch,
  TaxFilingBatchArchiveRecord,
  TaxFilingBatchReviewRecord,
  TaxItem,
  TaxpayerProfile,
  TaxRuleProfile,
  TaskTreeNode,
  VatWorkingPaper,
  Voucher,
  WorkflowCommandExecution,
  WorkflowCompensationRecord,
  WorkflowRun
} from "@finance-taxation/domain-model";
import {
  API_BASE_URL,
  clearStoredSession,
  requestText,
  type AccessUser,
  DocumentDetail,
  EventDetail,
  RndProjectDetail,
  VoucherDetail,
  WorkflowCommandDetail,
  WorkflowCompensationCreateInput,
  WorkflowRunDetail,
  request,
  requestMultipart
} from "./api/client";


export async function getCurrentUser() {
  return request<AccessUser>("/api/access/me");
}

export async function logoutSession() {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  clearStoredSession();
}

export { describePageLoadError, isAuthRequiredError } from "./request-errors";

/** V7 J2：菜单项带上与前端侧栏一致的分组元数据。 */
export interface MenuNodeWithGroup extends MenuNode {
  groupKey: string;
  groupLabel: string;
}

export async function getMenu() {
  return request<{ items: MenuNodeWithGroup[] }>("/api/access/menu");
}

export async function listEvents() {
  return request<{ items: BusinessEvent[]; total: number }>("/api/events");
}

export async function getEventDetail(eventId: string) {
  return request<EventDetail>(`/api/events/${eventId}`);
}

export async function createEvent(input: {
  type: string;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string | null;
  currency: string;
  source: string;
  contractId?: string | null;
  /**
   * 往来单位（V12-C2）。凭证从事项继承这个维度——不填的话应收应付分录就没有
   * 分户依据，进不了账龄表也没法做核销。
   */
  counterpartyId?: string | null;
}) {
  return request<BusinessEvent>("/api/events", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateEvent(
  eventId: string,
  input: Partial<BusinessEvent>
) {
  return request<BusinessEvent>(`/api/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function analyzeEvent(eventId: string) {
  return request<{ generatedTasks: number; status: string }>(`/api/events/${eventId}/analyze`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function listTasks(businessEventId?: string, overdueOnly?: boolean) {
  const q = new URLSearchParams();
  if (businessEventId) q.set("businessEventId", businessEventId);
  if (overdueOnly) q.set("overdueOnly", "true");
  const qs = q.toString();
  return request<{ items: (Task & { isOverdue?: boolean })[]; tree: TaskTreeNode[]; total: number }>(
    `/api/tasks${qs ? "?" + qs : ""}`
  );
}

export async function listWorkflowRuns(filters?: {
  resourceType?: string;
  resourceId?: string;
  state?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.resourceType) params.set("resourceType", filters.resourceType);
  if (filters?.resourceId) params.set("resourceId", filters.resourceId);
  if (filters?.state) params.set("state", filters.state);
  const qs = params.toString();
  return request<{ items: WorkflowRun[]; total: number }>(`/api/workflows/runs${qs ? `?${qs}` : ""}`);
}

export async function getWorkflowRunDetail(runId: string) {
  return request<WorkflowRunDetail>(`/api/workflows/runs/${runId}`);
}

export async function listWorkflowCommands(filters?: {
  workflowRunId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.workflowRunId) params.set("workflowRunId", filters.workflowRunId);
  if (filters?.resourceType) params.set("resourceType", filters.resourceType);
  if (filters?.resourceId) params.set("resourceId", filters.resourceId);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return request<{ items: WorkflowCommandExecution[]; total: number }>(
    `/api/workflows/commands${qs ? `?${qs}` : ""}`
  );
}

export async function getWorkflowCommandDetail(commandId: string) {
  return request<WorkflowCommandDetail>(`/api/workflows/commands/${commandId}`);
}

export async function retryWorkflowCommand(commandId: string) {
  return request<WorkflowCommandExecution>(`/api/workflows/commands/${commandId}/retry`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function cancelWorkflowCommand(commandId: string) {
  return request<WorkflowCommandExecution>(`/api/workflows/commands/${commandId}/cancel`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function createWorkflowCompensation(
  commandId: string,
  input: WorkflowCompensationCreateInput
) {
  return request<WorkflowCompensationRecord>(`/api/workflows/commands/${commandId}/compensations`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function remindTask(taskId: string) {
  return request<{ ok: boolean; taskId: string; remindedAt: string }>(`/api/tasks/${taskId}/remind`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function updateTaskStatus(taskId: string, status: string) {
  return request<{ id: string; status: string }>(`/api/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status })
  });
}

export async function listDocuments(filters?: { businessEventId?: string }) {
  const params = new URLSearchParams();
  if (filters?.businessEventId) params.set("businessEventId", filters.businessEventId);
  const qs = params.toString();
  return request<{ items: GeneratedDocument[]; total: number }>(`/api/documents${qs ? "?" + qs : ""}`);
}

export async function uploadDocumentFileRaw(documentId: string, file: File) {
  const token = window.localStorage.getItem("finance-taxation-v2-token") ?? "";
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "上传失败" })) as { error?: string };
    throw new Error(err.error ?? "上传失败");
  }
  return response.json() as Promise<DocumentDetail>;
}

export async function listTaxItems(filters?: { businessEventId?: string }) {
  const params = new URLSearchParams();
  if (filters?.businessEventId) params.set("businessEventId", filters.businessEventId);
  const qs = params.toString();
  return request<{ items: TaxItem[]; total: number }>(`/api/tax-items${qs ? "?" + qs : ""}`);
}

export async function listVouchers(filters?: { businessEventId?: string }) {
  const params = new URLSearchParams();
  if (filters?.businessEventId) params.set("businessEventId", filters.businessEventId);
  const qs = params.toString();
  return request<{ items: Voucher[]; total: number }>(`/api/vouchers${qs ? "?" + qs : ""}`);
}

export interface VoucherTemplate {
  key: string;
  label: string;
  description: string;
  voucherType: Voucher["voucherType"];
}

export async function listVoucherTemplates() {
  return request<{ items: VoucherTemplate[]; total: number }>("/api/vouchers/templates");
}

export async function createVoucherFromTemplate(input: {
  templateKey: string;
  amount: string;
  businessEventId: string;
  summary?: string;
  /**
   * 外币业务（V12-D5）。填了它，`amount` 就是**原币**金额，后端按业务发生日的
   * 汇率折算成本位币入账。不填则一切照旧。
   */
  currency?: string;
}) {
  return request<Voucher>("/api/vouchers", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getVoucherDetail(voucherId: string) {
  return request<VoucherDetail>(`/api/vouchers/${voucherId}`);
}

export async function updateVoucher(voucherId: string, input: Partial<Voucher>) {
  return request<Voucher>(`/api/vouchers/${voucherId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function validateVoucher(voucherId: string) {
  return request<{
    id: string;
    valid: boolean;
    totals: { debit: string; credit: string };
    issues: string[];
  }>(`/api/vouchers/${voucherId}/validate`);
}

export async function approveVoucher(voucherId: string) {
  return request<Voucher>(`/api/vouchers/${voucherId}/approve`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

/**
 * 过账。
 *
 * **必须传终审人**：`voucher.post` 是高风险动作，服务端要求终审人 ≠ 执行人
 * （`workflows/authorization.ts`）。此前这里写死发空 body，于是前台
 * **完全无法过账任何一张凭证**——每次都 400 WORKFLOW_AUTHORIZATION_REQUIRED，
 * 还以未翻译的英文弹出来。
 *
 * 终审人不给默认值：默认成当前用户只会撞「执行人 == 终审人」，
 * 报出的还是含糊的职责冲突。让调用方显式选人。
 */
export async function postVoucher(voucherId: string, authorizerUserId: string) {
  return request<VoucherDetail>(`/api/vouchers/${voucherId}/post`, {
    method: "POST",
    body: JSON.stringify({ authorizerUserId })
  });
}

/**
 * 红冲一张已过账的凭证。
 *
 * 返回的是新生成的**红冲凭证草稿**——系统生成的凭证一律是草稿，
 * 要到凭证中心复核过账之后原分录才真的被冲平。
 */
export async function reverseVoucher(voucherId: string, reason?: string) {
  return request<{ reversal: Voucher; original: Voucher }>(
    `/api/vouchers/${encodeURIComponent(voucherId)}/reverse`,
    { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }
  );
}

export async function getDocumentDetail(documentId: string) {
  return request<DocumentDetail>(`/api/documents/${documentId}`);
}

export async function attachDocumentFile(documentId: string, attachmentId: string) {
  return request<DocumentDetail>(`/api/documents/${documentId}/attach`, {
    method: "POST",
    body: JSON.stringify({
      attachmentId,
      fileName: attachmentId,
      fileType: "application/octet-stream",
      fileSize: 0
    })
  });
}

export async function archiveDocument(documentId: string) {
  return request<GeneratedDocument>(`/api/documents/${documentId}/archive`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function listLedgerEntries(filters?: { voucherId?: string; businessEventId?: string }) {
  const params = new URLSearchParams();
  if (filters?.voucherId) params.set("voucherId", filters.voucherId);
  if (filters?.businessEventId) params.set("businessEventId", filters.businessEventId);
  const query = params.toString();
  const path = query ? `/api/ledger/entries?${query}` : "/api/ledger/entries";
  return request<{ items: LedgerEntry[]; total: number }>(path);
}

export async function listLedgerPostingBatches(voucherId?: string) {
  const path = voucherId
    ? `/api/ledger/posting-batches?voucherId=${voucherId}`
    : "/api/ledger/posting-batches";
  return request<{ items: LedgerPostingBatch[]; total: number }>(path);
}

export async function getLedgerSummary() {
  return request<{
    items: Array<{
      accountCode: string;
      accountName: string;
      debit: string;
      credit: string;
    }>;
    total: number;
  }>("/api/ledger/summary");
}

export async function getLedgerBalances() {
  return request<{
    items: Array<{
      accountCode: string;
      accountName: string;
      debit: string;
      credit: string;
      balance: string;
    }>;
    total: number;
  }>("/api/ledger/balances");
}

export async function getCashJournal(params?: {
  type?: "cash" | "bank";
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return request<{
    items: Array<{
      id: string;
      accountCode: string;
      accountName: string;
      summary: string;
      debit: string;
      credit: string;
      balance: string;
      postedAt: string;
      voucherId: string;
    }>;
    total: number;
    journalType: string;
    prefix: string;
  }>(`/api/ledger/cash-journal${qs ? "?" + qs : ""}`);
}

export async function listTaxFilingBatches() {
  return request<{ items: TaxFilingBatch[]; total: number }>("/api/tax-filing-batches");
}

export async function listTaxpayerProfiles() {
  return request<{ items: TaxpayerProfile[]; total: number }>("/api/taxpayer-profiles");
}

export async function createTaxpayerProfile(input: {
  taxpayerType: "general_vat" | "small_scale" | "general_simplified";
  effectiveFrom: string;
  notes?: string;
}) {
  return request<TaxpayerProfile>("/api/taxpayer-profiles", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getVatWorkingPaper(filingPeriod: string) {
  return request<VatWorkingPaper>(`/api/tax/vat-working-paper?filingPeriod=${filingPeriod}`);
}

export async function getTaxRuleProfile(taxType: string, occurredOn: string) {
  return request<TaxRuleProfile & { filingPeriod: string }>(
    `/api/tax/rules?taxType=${encodeURIComponent(taxType)}&occurredOn=${occurredOn}`
  );
}

export async function getCorporateIncomeTaxPreparation(filingPeriod: string) {
  return request<CorporateIncomeTaxPreparation>(
    `/api/tax/corporate-income-tax-preparation?filingPeriod=${encodeURIComponent(filingPeriod)}`
  );
}

export async function getTaxPrintableHtml(kind: "vat" | "corporate_income_tax", filingPeriod: string) {
  return requestText(
    `/api/tax/printable?kind=${encodeURIComponent(kind)}&filingPeriod=${encodeURIComponent(filingPeriod)}`
  );
}

export async function getIndividualIncomeTaxMaterials(filingPeriod: string) {
  return request<IndividualIncomeTaxMaterial>(
    `/api/tax/individual-income-tax-materials?filingPeriod=${encodeURIComponent(filingPeriod)}`
  );
}

export async function getStampAndSurtaxSummary(filingPeriod: string) {
  return request<StampAndSurtaxSummary>(
    `/api/tax/stamp-and-surtax-summary?filingPeriod=${encodeURIComponent(filingPeriod)}`
  );
}

export async function getBalanceSheetReport(input: {
  periodType: "month" | "quarter" | "year";
  year: number;
  month?: number;
  quarter?: number;
}) {
  const params = new URLSearchParams({
    periodType: input.periodType,
    year: String(input.year)
  });
  if (input.month) params.set("month", String(input.month));
  if (input.quarter) params.set("quarter", String(input.quarter));
  return request<BalanceSheetReport>(`/api/reports/balance-sheet?${params.toString()}`);
}

export async function getProfitStatementReport(input: {
  periodType: "month" | "quarter" | "year";
  year: number;
  month?: number;
  quarter?: number;
}) {
  const params = new URLSearchParams({
    periodType: input.periodType,
    year: String(input.year)
  });
  if (input.month) params.set("month", String(input.month));
  if (input.quarter) params.set("quarter", String(input.quarter));
  return request<ProfitStatementReport>(`/api/reports/profit-statement?${params.toString()}`);
}

export async function getCashFlowReport(input: {
  periodType: "month" | "quarter" | "year";
  year: number;
  month?: number;
  quarter?: number;
}) {
  const params = new URLSearchParams({
    periodType: input.periodType,
    year: String(input.year)
  });
  if (input.month) params.set("month", String(input.month));
  if (input.quarter) params.set("quarter", String(input.quarter));
  return request<CashFlowReport>(`/api/reports/cash-flow?${params.toString()}`);
}

export async function createReportSnapshot(input: {
  reportType: "balance_sheet" | "profit_statement" | "cash_flow";
  periodType: "month" | "quarter" | "year";
  year: number;
  month?: number;
  quarter?: number;
}) {
  const params = new URLSearchParams({
    periodType: input.periodType,
    year: String(input.year)
  });
  if (input.month) params.set("month", String(input.month));
  if (input.quarter) params.set("quarter", String(input.quarter));
  return request<ReportSnapshot>(`/api/reports/snapshots?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      reportType: input.reportType,
      periodType: input.periodType
    })
  });
}

/**
 * 快照还准不准（V15/P1）。
 *
 * `unknown` 是**合法状态**，不能当成 `fresh` 渲染：老快照没有溯源信息，
 * 给它打绿勾会让人拿着一份可能已经失效的报表去申报。
 */
export type SnapshotFreshness =
  | { status: "fresh" }
  | { status: "stale"; reason: string }
  | { status: "unknown"; reason: string };

export type ReportSnapshotWithFreshness = ReportSnapshot & { freshness?: SnapshotFreshness };

export async function listReportSnapshots(reportType?: string) {
  const path = reportType ? `/api/reports/snapshots?reportType=${reportType}` : "/api/reports/snapshots";
  return request<{ items: ReportSnapshotWithFreshness[]; total: number }>(path);
}

export async function getReportDiff(fromSnapshotId: string, toSnapshotId: string) {
  return request<ReportDiffResult>(
    `/api/reports/diff?fromSnapshotId=${fromSnapshotId}&toSnapshotId=${toSnapshotId}`
  );
}

export async function getChairmanReportSummary(snapshotId: string) {
  return request<ChairmanReportSummary>(`/api/reports/chairman-summary?snapshotId=${snapshotId}`);
}

export async function getPrintableReportHtml(snapshotId: string) {
  return requestText(`/api/reports/printable?snapshotId=${snapshotId}`);
}

export async function listRndProjects() {
  return request<{ items: Array<RndProject & { summary: RndProjectSummary }>; total: number }>(
    "/api/rnd/projects"
  );
}

export async function createRndProject(input: {
  businessEventId?: string | null;
  code?: string;
  name: string;
  capitalizationPolicy?: "expense" | "capitalize" | "mixed";
  startedOn?: string;
  notes?: string;
}) {
  return request<RndProject>("/api/rnd/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getRndProjectDetail(projectId: string) {
  return request<RndProjectDetail>(`/api/rnd/projects/${projectId}`);
}

export async function getRndSuperDeductionPackage(projectId: string) {
  return request<SuperDeductionPackage>(`/api/rnd/projects/${projectId}/super-deduction-package`);
}

export async function createRndCostLine(
  projectId: string,
  input: {
    businessEventId?: string | null;
    voucherId?: string | null;
    costType: string;
    accountingTreatment: "expensed" | "capitalized";
    amount: string;
    occurredOn: string;
    notes?: string;
  }
) {
  return request(`/api/rnd/projects/${projectId}/cost-lines`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createRndTimeEntry(
  projectId: string,
  input: {
    businessEventId?: string | null;
    userId?: string | null;
    staffName: string;
    workDate: string;
    hours: string;
    notes?: string;
  }
) {
  return request(`/api/rnd/projects/${projectId}/time-entries`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listRiskFindings() {
  return request<{ items: RiskFinding[]; total: number }>("/api/risk/findings");
}

export async function closeRiskFinding(findingId: string, resolution: string) {
  return request<RiskFinding>(`/api/risk/findings/${findingId}/close`, {
    method: "POST",
    body: JSON.stringify({ resolution })
  });
}

export async function listRiskClosureRecords(findingId: string) {
  return request<{ items: RiskClosureRecord[]; total: number }>(`/api/risk/findings/${findingId}/closures`);
}

export async function runEventRiskCheck(eventId: string) {
  return request<{ items: RiskFinding[]; total: number }>(`/api/events/${eventId}/risk-check`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function getTaxFilingBatchDetail(batchId: string) {
  return request<TaxFilingBatch & {
    items: TaxItem[];
    reviews: TaxFilingBatchReviewRecord[];
    archives: TaxFilingBatchArchiveRecord[];
  }>(`/api/tax-filing-batches/${batchId}`);
}

export async function validateTaxFilingBatch(batchId: string) {
  return request<{ id: string; valid: boolean; issues: string[]; itemCount: number }>(
    `/api/tax-filing-batches/${batchId}/validate`,
    {
      method: "POST",
      body: JSON.stringify({})
    }
  );
}

export async function submitTaxFilingBatch(batchId: string) {
  return request<TaxFilingBatch>(`/api/tax-filing-batches/${batchId}/submit`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function reviewTaxFilingBatch(batchId: string, input: {
  reviewResult: "approved" | "rejected";
  reviewNotes: string;
}) {
  return request<TaxFilingBatch & {
    items: TaxItem[];
    reviews: TaxFilingBatchReviewRecord[];
    archives: TaxFilingBatchArchiveRecord[];
  }>(`/api/tax-filing-batches/${batchId}/review`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function archiveTaxFilingBatch(batchId: string, input: {
  archiveLabel: string;
  archiveNotes?: string;
}) {
  return request<TaxFilingBatch & {
    items: TaxItem[];
    reviews: TaxFilingBatchReviewRecord[];
    archives: TaxFilingBatchArchiveRecord[];
  }>(`/api/tax-filing-batches/${batchId}/archive`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getClosingBundleHtml(kind: ClosingPackageExport["kind"], period: string) {
  return requestText(
    `/api/packages/closing-bundle?kind=${encodeURIComponent(kind)}&period=${encodeURIComponent(period)}`
  );
}

export async function listExportJobs(limit = 20, status?: ExportJob["status"]) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  return request<{ items: ExportJob[]; total: number }>(`/api/exports/jobs?${params.toString()}`);
}

export async function listExportArchiveEntries(limit = 20, filters?: { kind?: ExportArtifactKind | ""; keyword?: string }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters?.kind) params.set("kind", filters.kind);
  if (filters?.keyword) params.set("keyword", filters.keyword);
  return request<{ items: ExportArchiveEntry[]; total: number }>(`/api/exports/archive-index?${params.toString()}`);
}

export async function createExportJob(input: {
  kind: ExportArtifactKind;
  label: string;
  fileName: string;
  resourceType?: string | null;
  resourceId?: string | null;
  periodLabel?: string | null;
  status?: ExportJob["status"];
}) {
  return request<{ job: ExportJob; archiveEntry: ExportArchiveEntry; reused: boolean }>("/api/exports/jobs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateExportJobStatus(jobId: string, status: ExportJob["status"]) {
  return request<{ job: ExportJob }>(`/api/exports/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function updateExportJobRuntime(
  jobId: string,
  input: {
    status: ExportJob["status"];
    errorMessage?: string;
    nextRetryAt?: string | null;
  }
) {
  return request<{ job: ExportJob }>(`/api/exports/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export interface DashboardCard {
  key: string;
  label: string;
  value: string;
  trend: string;
}

export interface DashboardQueueItem {
  id: string;
  title: string;
  status: string;
  route: string;
  severity: "high" | "medium" | "low";
}

/** 费用构成的一块，按科目汇总（P1：替换前端的固定比例估算）。 */
export interface DashboardExpenseSlice {
  name: string;
  accountCode: string;
  amount: number;
  kind: "cost" | "expense" | "incomeTax";
}

export interface DashboardData {
  cards: DashboardCard[];
  /**
   * 费用构成明细。**可选**是为了兼容还没升级的后端：
   * `undefined` 表示没下发（前端退回估算并标注），`[]` 表示本期确实没有费用。
   */
  expenseBreakdown?: DashboardExpenseSlice[];
  queues: { approvals: number; blockedTasks: number; overdueTasks: number };
  profitOverview: {
    revenue: string;
    cost: string;
    /** 期间费用合计，不含所得税费用。 */
    expense: string;
    /** 所得税费用。revenue - cost - expense - incomeTax = netProfit。 */
    incomeTax: string;
    grossProfit: string;
    netProfit: string;
    grossMargin: string;
    netMargin: string;
  };
  riskBoard: {
    approvals: DashboardQueueItem[];
    blockedTasks: DashboardQueueItem[];
    overdueTasks: DashboardQueueItem[];
    riskEvents: DashboardQueueItem[];
  };
  aiSummary: {
    date: string;
    newEvents: number;
    postedVouchers: number;
    pendingTaxBatches: number;
    highlights: string[];
  };
  riskCount: number;
}

export async function getDashboardChairman() {
  return request<DashboardData>("/v2/dashboard/chairman");
}

/**
 * 历史收支趋势的一个会计期间。
 *
 * `hasData: false` 表示该期间**账上没有分录**，此时各金额一律为 `null`——后端不补零
 * 也不外推（口径见 apps/api 的 modules/dashboard/trend.ts）。前端必须把 `null` 画成
 * 断点，把它当 0 处理就是把「这个月没有账」画成「这个月收入归零」。
 */
export interface ChairmanTrendPoint {
  period: string;
  hasData: boolean;
  revenue: string | null;
  cost: string | null;
  /** 期间费用合计，不含所得税费用。 */
  expense: string | null;
  incomeTax: string | null;
  grossProfit: string | null;
  netProfit: string | null;
}

export interface ChairmanTrendData {
  endPeriod: string;
  months: number;
  /** 连续的期间序列，升序；没有账的期间也占一格。 */
  points: ChairmanTrendPoint[];
  /** 有账的期间数；为 0 表示整段区间无数据，应整块留白而不是画一张空图。 */
  periodsWithData: number;
}

/**
 * 不传 `period`：让后端取默认的当前期间，与 getDashboardChairman 完全一致，
 * 这样趋势图最后一个点与利润概览卡片说的必定是同一个月。
 */
export async function getDashboardChairmanTrend(months: number) {
  return request<ChairmanTrendData>(`/api/dashboard/chairman/trend?months=${months}`);
}

export async function listAccounts(filters?: { category?: string; q?: string; leafOnly?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.leafOnly) params.set("leafOnly", "true");
  const query = params.toString();
  const path = query ? `/api/accounts?${query}` : "/api/accounts";
  return request<{ items: ChartAccount[]; total: number }>(path);
}

export async function getAccountByCode(code: string) {
  return request<ChartAccount>(`/api/accounts/${code}`);
}

export async function uploadDocumentFile(documentId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return requestMultipart<DocumentDetail>(`/api/documents/${documentId}/upload`, formData);
}
