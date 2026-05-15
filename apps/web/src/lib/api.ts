import type {
  BusinessEvent,
  BusinessEventActivity,
  ChartAccount,
  DocumentAttachmentRecord,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  LedgerEntry,
  LedgerPostingBatch,
  MenuNode,
  Task,
  TaxFilingBatch,
  TaxItem,
  TaskTreeNode,
  Voucher
} from "@finance-taxation/domain-model";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";
const TOKEN_KEY = "finance-taxation-v2-token";
const REFRESH_TOKEN_KEY = "finance-taxation-v2-refresh-token";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData
  });

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

export async function listTasks(businessEventId?: string) {
  const path = businessEventId ? `/api/tasks?businessEventId=${businessEventId}` : "/api/tasks";
  return request<{ items: Task[]; tree: TaskTreeNode[]; total: number }>(path);
}

export async function listDocuments() {
  return request<{ items: GeneratedDocument[]; total: number }>("/api/documents");
}

export async function listTaxItems() {
  return request<{ items: TaxItem[]; total: number }>("/api/tax-items");
}

export async function listVouchers() {
  return request<{ items: Voucher[]; total: number }>("/api/vouchers");
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

export async function listTaxFilingBatches() {
  return request<{ items: TaxFilingBatch[]; total: number }>("/api/tax-filing-batches");
}

export async function getTaxFilingBatchDetail(batchId: string) {
  return request<TaxFilingBatch & { items: TaxItem[] }>(`/api/tax-filing-batches/${batchId}`);
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

export interface DashboardCard {
  key: string;
  label: string;
  value: string;
  trend: string;
}

export interface DashboardData {
  cards: DashboardCard[];
  queues: { approvals: number; blockedTasks: number; overdueTasks: number };
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
