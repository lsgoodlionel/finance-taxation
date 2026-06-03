import type {
  AuditLog,
  KnowledgeItem,
  BalanceSheetReport,
  BusinessEvent,
  Contract,
  ContractWithEventCount,
  BusinessEventActivity,
  CashFlowReport,
  ChartAccount,
  ChairmanReportSummary,
  ClosingPackageExport,
  CorporateIncomeTaxPreparation,
  DocumentAttachmentRecord,
  Employee,
  ExportArchiveEntry,
  ExportArtifactKind,
  ExportJob,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  LedgerEntry,
  LedgerPostingBatch,
  MenuNode,
  PayrollPeriodSummary,
  PayrollPolicy,
  PayrollRecord,
  PayrollTaxReviewLedger,
  ProfitStatementReport,
  ReportDiffResult,
  ReportSnapshot,
  RiskClosureRecord,
  RiskFinding,
  RndAccountingPolicyReview,
  RndPolicyGuidance,
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
  Voucher
} from "@finance-taxation/domain-model";
import { describePageLoadError, isAuthRequiredError } from "./request-errors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const TOKEN_KEY = "finance-taxation-v2-token";
const REFRESH_TOKEN_KEY = "finance-taxation-v2-refresh-token";
export const AUTH_EXPIRED_EVENT = "finance-taxation-v2-auth-expired";

interface AccessUser {
  id: string;
  companyId: string;
  username: string;
  displayName: string;
  roleIds: string[];
}

export interface EventDetail extends BusinessEvent {
  relations: Array<{
    id: string;
    relationType: string;
    label: string;
    targetId: string;
  }>;
  tasks: Task[];
  taskTree: TaskTreeNode[];
  documentMappings: EventDocumentMapping[];
  taxMappings: EventTaxMapping[];
  voucherDrafts: EventVoucherDraft[];
  generatedDocuments: GeneratedDocument[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  mappingGeneratedAt: string;
  activities: BusinessEventActivity[];
}

export interface DocumentDetail extends GeneratedDocument {
  notes: string | null;
  attachments: DocumentAttachmentRecord[];
}

export interface VoucherDetail extends Voucher {
  postingRecords: Array<{
    id: string;
    voucherId: string;
    businessEventId: string;
    postedByName: string;
    postedAt: string;
  }>;
}

export interface RndProjectDetail extends RndProject {
  costLines: Array<{
    id: string;
    costType: string;
    accountingTreatment: string;
    amount: string;
    occurredOn: string;
    notes: string;
  }>;
  timeEntries: Array<{
    id: string;
    staffName: string;
    workDate: string;
    hours: string;
    notes: string;
  }>;
  summary: RndProjectSummary;
  policyReview: RndAccountingPolicyReview;
  guidance: RndPolicyGuidance;
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function setStoredRefreshToken(token: string) {
  window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function getStoredRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

function clearStoredSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function emitAuthExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}

function throwAuthRequired() {
  clearStoredSession();
  emitAuthExpired();
  throw new Error("AUTH_REQUIRED");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  // Auto-refresh on 401, but never recurse into the refresh endpoint itself
  if (response.status === 401 && path !== "/api/auth/refresh") {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      const refreshResp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      }).catch(() => null);
      if (refreshResp?.ok) {
        const data = await refreshResp.json() as { accessToken: string; refreshToken: string };
        setStoredToken(data.accessToken);
        setStoredRefreshToken(data.refreshToken);
        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set("Content-Type", "application/json");
        retryHeaders.set("Authorization", `Bearer ${data.accessToken}`);
        response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: retryHeaders });
      }
    }
  }

  if (response.status === 401) {
    throwAuthRequired();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });
  if (response.status === 401) {
    throwAuthRequired();
  }
  if (!response.ok) {
    const payload = (await response.text().catch(() => "")) || `Request failed: ${response.status}`;
    throw new Error(payload);
  }
  return response.text();
}

async function requestMultipart<T>(path: string, formData: FormData, timeoutMs = 200000): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (response.status === 401) {
    throwAuthRequired();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Upload failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function login(username: string, password: string) {
  const payload = await request<{
    accessToken: string;
    refreshToken: string;
    user: AccessUser;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setStoredToken(payload.accessToken);
  setStoredRefreshToken(payload.refreshToken);
  return payload;
}

export async function refreshSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("Missing refresh token");
  }
  const payload = await request<{ accessToken: string; refreshToken: string }>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
  setStoredToken(payload.accessToken);
  setStoredRefreshToken(payload.refreshToken);
  return payload;
}

export async function getCurrentUser() {
  return request<AccessUser>("/api/access/me");
}

export async function logoutSession() {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  clearStoredSession();
}

export { describePageLoadError, isAuthRequiredError } from "./request-errors";

export async function getMenu() {
  return request<{ items: MenuNode[] }>("/api/access/menu");
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

export async function postVoucher(voucherId: string) {
  return request<VoucherDetail>(`/api/vouchers/${voucherId}/post`, {
    method: "POST",
    body: JSON.stringify({})
  });
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

export async function listReportSnapshots(reportType?: string) {
  const path = reportType ? `/api/reports/snapshots?reportType=${reportType}` : "/api/reports/snapshots";
  return request<{ items: ReportSnapshot[]; total: number }>(path);
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

export interface DashboardData {
  cards: DashboardCard[];
  queues: { approvals: number; blockedTasks: number; overdueTasks: number };
  profitOverview: {
    revenue: string;
    cost: string;
    expense: string;
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

export async function disburseTransferBatch(batchId: string, bankTransferRef?: string) {
  return request<{ ok: boolean; eventId: string }>(`/api/payroll/transfer/batches/${batchId}/disburse`, {
    method: "POST", body: JSON.stringify({ bankTransferRef })
  });
}

export async function downloadTransferFile(batchId: string, format: "generic" | "cmb") {
  const token = window.localStorage.getItem("finance-taxation-v2-token") ?? "";
  const base = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
  const resp = await fetch(`${base}/api/payroll/transfer/batches/${batchId}/file?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`导出失败 HTTP ${resp.status}`);
  return resp.blob();
}

// ── P6 AI Agents ─────────────────────────────────────────────────────────────

export interface AccountingSuggestion {
  ok: boolean;
  resultId: string;
  templateKey: string | null;
  voucherType: string;
  lines: { id: string; summary: string; accountCode: string; accountName: string; debit: string; credit: string }[];
  rationale: string;
  confidence: number;
  needsReview: boolean;
}

export async function suggestAccounting(businessEventId: string) {
  return request<AccountingSuggestion>("/api/ai/accounting/suggest", {
    method: "POST", body: JSON.stringify({ businessEventId })
  });
}

export interface CompletenessResult {
  ok: boolean;
  resultId: string;
  required: string[];
  missing: string[];
  score: number;
  blocked: boolean;
  recommendation: string;
}

export async function assessCompleteness(businessEventId: string) {
  return request<CompletenessResult>("/api/ai/completeness/assess", {
    method: "POST", body: JSON.stringify({ businessEventId })
  });
}

export async function acceptAiResult(resultId: string, accepted: boolean) {
  return request<{ ok: boolean }>(`/api/ai/results/${resultId}/accept`, {
    method: "POST", body: JSON.stringify({ accepted })
  });
}

// ── 设置就绪度 ───────────────────────────────────────────────────────────────

export interface SetupItem {
  key: string;
  label: string;
  done: boolean;
  actionPath: string;
  hint: string;
}

export async function getSetupStatus() {
  return request<{ items: SetupItem[]; doneCount: number; total: number; ready: boolean }>("/api/setup/status");
}

// ── 全局搜索 ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: string;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string;
  path: string;
}

export async function globalSearch(q: string) {
  return request<{ results: SearchResult[]; total: number }>(`/api/search?q=${encodeURIComponent(q)}`);
}

// ── 统一待办收件箱 ───────────────────────────────────────────────────────────

export interface InboxItem {
  key: string;
  label: string;
  count: number;
  tone: "warning" | "info";
  actionPath: string;
  hint: string;
}

export async function getInbox() {
  return request<{ items: InboxItem[]; totalPending: number }>("/api/inbox");
}

// ── 月度结账状态 ─────────────────────────────────────────────────────────────

export interface CloseStep {
  key: string;
  label: string;
  status: "done" | "pending" | "todo";
  detail: string;
  count: number;
  actionPath: string;
}

export async function getCloseStatus(period: string) {
  return request<{
    period: string; steps: CloseStep[]; doneCount: number; total: number;
    canLock: boolean; locked: boolean;
  }>(`/api/close/status?period=${encodeURIComponent(period)}`);
}

// ── P4 社保联动 ───────────────────────────────────────────────────────────────

export async function closeSocialSecurity(period: string) {
  return request<{
    ok: boolean; eventId: string; taskId: string; voucherIds: string[];
    summary: { period: string; socialSecurityEmployer: number; socialSecurityEmployee: number; housingFundEmployer: number; housingFundEmployee: number };
  }>(`/api/payroll/periods/${encodeURIComponent(period)}/social-security-closure`, {
    method: "POST", body: JSON.stringify({})
  });
}

export async function getRndTrend(months?: number) {
  const q = months ? `?months=${months}` : "";
  return request<{
    trend: Array<{ month: string; expensed: number; capitalized: number; total: number }>;
    months: number;
    detail: Array<{ month: string; costType: string; accountingTreatment: string; total: number }>;
  }>(`/api/rnd/trend${q}`);
}

export async function listAuditLogs(params?: {
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.resourceType) q.set("resourceType", params.resourceType);
  if (params?.resourceId) q.set("resourceId", params.resourceId);
  if (params?.userId) q.set("userId", params.userId);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return request<{ items: AuditLog[]; total: number; limit: number; offset: number }>(
    `/api/audit/logs${qs ? "?" + qs : ""}`
  );
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export async function listKnowledgeItems(params?: {
  category?: string;
  q?: string;
  includeInactive?: boolean;
}) {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.q) q.set("q", params.q);
  if (params?.includeInactive) q.set("includeInactive", "true");
  const qs = q.toString();
  return request<{ items: KnowledgeItem[]; total: number }>(
    `/api/knowledge${qs ? "?" + qs : ""}`
  );
}

export async function createKnowledgeItem(data: {
  category: string;
  title: string;
  content: string;
  tags?: string[];
}) {
  return request<KnowledgeItem>("/api/knowledge", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateKnowledgeItem(id: string, data: Partial<{
  category: string;
  title: string;
  content: string;
  tags: string[];
  isActive: boolean;
}>) {
  return request<KnowledgeItem>(`/api/knowledge/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteKnowledgeItem(id: string) {
  return request<{ ok: boolean }>(`/api/knowledge/${id}`, { method: "DELETE" });
}

export interface ParsedKnowledgeItem {
  fileName: string;
  title: string;
  category: "regulation" | "policy" | "faq" | "template";
  content: string;
  tags: string[];
  error?: string;
}

export async function parseKnowledgeDocuments(files: File[]): Promise<{ items: ParsedKnowledgeItem[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file, file.name);
  }
  return requestMultipart<{ items: ParsedKnowledgeItem[] }>("/api/knowledge/parse-documents", formData);
}

// ── 账期管理 ──────────────────────────────────────────────────────────────────

export interface AccountingPeriod {
  id: string;
  period: string;
  isLocked: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  note: string | null;
  updatedAt: string;
}

export async function listAccountingPeriods() {
  return request<{ items: AccountingPeriod[]; total: number }>("/api/ledger/periods");
}

export async function lockPeriod(period: string) {
  return request<AccountingPeriod>(`/api/ledger/periods/${encodeURIComponent(period)}/lock`, {
    method: "POST"
  });
}

export async function unlockPeriod(period: string) {
  return request<AccountingPeriod>(`/api/ledger/periods/${encodeURIComponent(period)}/unlock`, {
    method: "POST"
  });
}

// ── 公司设置 ──────────────────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string;
  name: string;
  registeredAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
  creditCode?: string;
  legalRepresentative?: string;
  bankName?: string;
  bankAccount?: string;
  financeApproverRole?: string;
  updatedAt?: string;
}

export async function getCompanyProfile() {
  return request<CompanyProfile>("/api/settings/company");
}

export async function updateCompanyProfile(data: Partial<Omit<CompanyProfile, "id">>) {
  return request<CompanyProfile>("/api/settings/company", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export interface AiProviderModel {
  id: string;
  name: string;
}

export interface AiProviderInfo {
  id: string;
  name: string;
  authType: "apiKey" | "none";
  models: AiProviderModel[];
  defaultBaseUrl: string;
  keyPlaceholder: string;
}

export interface AiConfigResponse {
  provider: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
  extraConfig: Record<string, string> | null;
  providers: AiProviderInfo[];
}

export async function getAiSettings() {
  return request<AiConfigResponse>("/api/settings/ai");
}

export async function updateAiSettings(data: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  extraConfig?: Record<string, string>;
}) {
  return request<AiConfigResponse>("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function getOllamaModels(baseUrl: string) {
  const params = new URLSearchParams({ baseUrl });
  return request<{ models: { name: string; size: number; modifiedAt: string }[] }>(
    `/api/settings/ai/ollama-models?${params.toString()}`
  );
}

export async function testAiConnection(data: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  return request<{ ok: boolean; note: string }>("/api/settings/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

// ─── P1: Tax Integration — Declaration Export ─────────────────────────────────

/** 下载申报文件（返回 Blob URL，由调用方触发浏览器下载） */
export async function downloadDeclarationFile(
  type: "vat-xml" | "iit-csv" | "si-csv" | "fund-csv",
  period: string,
): Promise<{ blobUrl: string; fileName: string }> {
  const token = getStoredToken();
  const res = await fetch(
    `/api/tax-integration/${type}?period=${encodeURIComponent(period)}`,
    { headers: { Authorization: `Bearer ${token ?? ""}` } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "下载失败" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const nameMatch = disposition.match(/filename="?([^";]+)"?/);
  const fileName = nameMatch?.[1] ? decodeURIComponent(nameMatch[1]) : `${type}-${period}`;
  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), fileName };
}

export async function listDeclarationSubmissions(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ items: DeclarationSubmission[]; total: number }>(
    `/api/tax-integration/submissions${q}`,
  );
}

export async function confirmDeclarationSubmission(id: string, submissionRef?: string) {
  return request<{ ok: boolean }>(`/api/tax-integration/submissions/${id}/confirm`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionRef }),
  });
}

export interface DeclarationSubmission {
  id: string;
  taxType: string;       // 'vat'|'iit'|'si'|'housing_fund'
  filingPeriod: string;
  submissionMode: string;
  fileFormat: string;
  fileName: string;
  submissionRef: string | null;
  status: "generated" | "uploaded" | "confirmed" | "rejected";
  errorMessage: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  createdByName: string;
  createdAt: string;
}

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

// ─── P1: Invoices ─────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  direction: "input" | "output";
  invoice_type: string;
  invoice_code: string | null;
  invoice_no: string;
  invoice_date: string;
  seller_name: string;
  seller_tax_no: string;
  buyer_name: string;
  buyer_tax_no: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  tax_rate: number;
  verify_status: "pending" | "verified" | "invalid" | "error";
  verify_message: string | null;
  verified_at: string | null;
  business_event_id: string | null;
  document_id: string | null;
  voucher_id: string | null;
  source: "manual" | "ocr" | "import";
  notes: string;
  created_at: string;
}

export async function listInvoices(params?: {
  direction?: string; verifyStatus?: string; dateFrom?: string; dateTo?: string;
  page?: number; pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.direction)    q.set("direction", params.direction);
  if (params?.verifyStatus) q.set("verify_status", params.verifyStatus);
  if (params?.dateFrom)     q.set("date_from", params.dateFrom);
  if (params?.dateTo)       q.set("date_to", params.dateTo);
  if (params?.page)         q.set("page", String(params.page));
  if (params?.pageSize)     q.set("page_size", String(params.pageSize));
  const qs = q.toString();
  return request<{ items: Invoice[]; total: number; page: number; pageSize: number }>(
    `/api/invoices${qs ? "?" + qs : ""}`,
  );
}

export async function createInvoice(data: {
  direction?: string; invoiceType?: string; invoiceCode?: string;
  invoiceNo: string; invoiceDate: string; sellerName: string;
  sellerTaxNo?: string; buyerName?: string; buyerTaxNo?: string;
  amount?: number; taxAmount?: number; totalAmount?: number; taxRate?: number;
  businessEventId?: string; source?: string; notes?: string;
}) {
  return request<{ id: string; ok: boolean }>("/api/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function verifyInvoice(id: string) {
  return request<{ verifyStatus: string; message: string }>(`/api/invoices/${id}/verify`, {
    method: "POST",
  });
}

export async function ocrInvoice(data: { imageBase64?: string; text?: string }) {
  return request<{ extracted: Record<string, unknown> | null; confidence: string }>(
    "/api/invoices/ocr",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
  );
}

export async function deleteInvoice(id: string) {
  return request<{ ok: boolean }>(`/api/invoices/${id}`, { method: "DELETE" });
}

export async function generateInvoiceVoucher(id: string) {
  return request<{ ok: boolean; voucherId: string; eventId: string; summary: string }>(
    `/api/invoices/${id}/voucher`, { method: "POST", body: JSON.stringify({}) }
  );
}

// ─── P2: Integration Configuration ───────────────────────────────────────────

export interface IntegrationProviderMeta {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresApiSecret: boolean;
  requiresAppId: boolean;
  requiresEndpoint: boolean;
  docsUrl: string;
  freeQuota: string;
}

export interface IntegrationConfig {
  configType: string;
  provider: string;
  apiKey: string | null;
  apiSecret: string | null;
  appId: string | null;
  endpointUrl: string | null;
  extraConfig: Record<string, string>;
  enabled: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestMsg: string | null;
  updatedAt: string;
}

export async function listIntegrationConfigs() {
  return request<{
    items: IntegrationConfig[];
    providers: Record<string, IntegrationProviderMeta[]>;
  }>("/api/settings/integrations");
}

export async function getIntegrationConfig(configType: string) {
  return request<{
    config: IntegrationConfig;
    providers: IntegrationProviderMeta[];
  }>(`/api/settings/integrations/${configType}`);
}

export async function upsertIntegrationConfig(
  configType: string,
  data: {
    provider: string;
    apiKey?: string;
    apiSecret?: string;
    appId?: string;
    endpointUrl?: string;
    extraConfig?: Record<string, string>;
    enabled?: boolean;
  },
) {
  return request<{ ok: boolean; config: IntegrationConfig | null }>(
    `/api/settings/integrations/${configType}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) },
  );
}

export async function testIntegrationConfig(configType: string) {
  return request<{ ok: boolean; message: string; provider: string }>(
    `/api/settings/integrations/${configType}/test`,
    { method: "POST" },
  );
}
