/**
 * 前端 API 客户端的**核心层**：地址、令牌、请求封装，以及跨领域共用的详情类型。
 *
 * 从 3000 多行的 `lib/api.ts` 里拆出来（V15/P2）。那个文件是全仓改动最频繁、
 * 冲突最多的一处——每加一个接口都要在同一个地方排队。
 *
 * 领域接口按业务切在 `lib/api/*.ts`，都只依赖这一层，彼此不互相引用。
 * `lib/api.ts` 保留为门面（`export *`），既有 import 路径一行都不用改。
 *
 * `requestText` / `requestMultipart` 原本是文件内私有函数，拆开后领域模块要用，
 * 所以导出了——它们仍然只该在这一层的调用方内部使用。
 */
import type {
  BusinessEvent,
  BusinessEventActivity,
  DocumentAttachmentRecord,
  EventDocumentMapping,
  EventTaxMapping,
  EventVoucherDraft,
  GeneratedDocument,
  RndAccountingPolicyReview,
  RndCostLine,
  RndPolicyGuidance,
  RndProject,
  RndProjectSummary,
  RndTimeEntry,
  Task,
  TaxItem,
  TaskTreeNode,
  Voucher,
  WorkflowCommandExecution,
  WorkflowCompensationRecord,
  WorkflowRun,
  WorkflowTransitionRecord
} from "@finance-taxation/domain-model";
import { describePageLoadError, isAuthRequiredError } from "../request-errors";


// 可选链不是多余的：`import.meta.env` 在 Vite 下总是存在，但在 node --test
// 里整体是 undefined，读属性直接抛 TypeError。那会让**任何 import 本模块的
// 组件都无法做渲染测试**——不是某一个测试的问题，是一整类测试被挡住。
const rawApiBaseUrl = import.meta.env?.VITE_API_BASE_URL;
export const API_BASE_URL = rawApiBaseUrl === undefined ? "http://127.0.0.1:3100" : rawApiBaseUrl;
const TOKEN_KEY = "finance-taxation-v2-token";
const REFRESH_TOKEN_KEY = "finance-taxation-v2-refresh-token";
export const AUTH_EXPIRED_EVENT = "finance-taxation-v2-auth-expired";

export interface AccessUser {
  id: string;
  companyId: string;
  username: string;
  displayName: string;
  roleIds: string[];
  departmentName: string | null;
}

export type RuntimeExecutionState = "waiting" | "running" | "succeeded" | "failed" | "cancelled";
export type RuntimeAuthorizationState = "not_required" | "awaiting_authorization" | "authorized" | "insufficient";

export interface WorkflowRuntimeSummary {
  executionState: RuntimeExecutionState;
  executionLabel: string;
  executionMessage: string;
  authorizationState: RuntimeAuthorizationState;
  authorizationLabel: string;
  authorizationMessage: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
  issue?: {
    tone: "info" | "warning" | "error";
    title: string;
    message: string;
    detail?: string;
  };
  actions?: Array<{
    key: string;
    label: string;
    tone?: "primary" | "default" | "danger";
    params?: Record<string, string>;
  }>;
}

export type WorkflowRuntimeScope = "tasks" | "tax" | "vouchers" | "payroll" | "payroll-transfer";

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
  // 后端 getRndProjectDetail 直接返回完整行（含 voucherId / businessEventId），
  // 不做字段投影，因此此处必须用完整领域类型，否则会隐藏可用于对象级溯源的外键。
  costLines: RndCostLine[];
  timeEntries: RndTimeEntry[];
  summary: RndProjectSummary;
  policyReview: RndAccountingPolicyReview;
  guidance: RndPolicyGuidance;
}

export interface WorkflowRunDetail {
  run: WorkflowRun;
  transitions: WorkflowTransitionRecord[];
  commands: WorkflowCommandExecution[];
  compensations: WorkflowCompensationRecord[];
}

export interface WorkflowCommandDetail {
  command: WorkflowCommandExecution;
  run: WorkflowRun | null;
  compensations: WorkflowCompensationRecord[];
}

export interface WorkflowCompensationCreateInput {
  actionType?: string;
  reason: string;
  handoffToUserId?: string | null;
  handoffToName?: string | null;
  notes?: string;
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

export function clearStoredSession() {
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

/**
 * 导出供新的领域 API 模块复用（V13）。
 *
 * 本文件已近 3000 行，远超仓库约定的单文件上限。新增领域接口一律另开模块
 * （如 `api-expense-control.ts`），共用这里的鉴权、超时与错误归一逻辑——
 * 各自再实现一遍 fetch 包装才是真正的问题：token 刷新与 401 处理会立刻分叉。
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function requestText(path: string, init?: RequestInit): Promise<string> {
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

export async function requestMultipart<T>(path: string, formData: FormData, timeoutMs = 200000): Promise<T> {
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

export async function getWorkflowRuntimeSummary(
  scope: WorkflowRuntimeScope,
  params: Record<string, string | undefined> = {}
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await request<{ summary: WorkflowRuntimeSummary }>(`/api/runtime/${scope}${suffix}`);
  return payload.summary;
}
