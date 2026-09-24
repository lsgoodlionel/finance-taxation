/**
 * 固定资产 / 往来账龄 / 余额调节 / 定期凭证 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── V12 批次 C：固定资产 / 往来账龄 / 银行余额调节 / 定期凭证 ──────────────

export interface FixedAsset {
  id: string;
  assetNo: string;
  name: string;
  category: string;
  acquiredOn: string;
  originalCost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  depreciationStartPeriod: string;
  expenseAccountCode: string;
  status: "in_use" | "disposed";
  disposedOn: string | null;
}

export async function listFixedAssets(status?: "in_use" | "disposed") {
  const qs = status ? `?status=${status}` : "";
  return request<{ items: FixedAsset[]; total: number }>(`/api/assets${qs}`);
}

export async function createFixedAsset(body: Record<string, unknown>) {
  return request<FixedAsset>("/api/assets", { method: "POST", body: JSON.stringify(body) });
}

/** 折旧计提原因；`reason` 回答"这台设备这个月为什么没提折旧"。 */
export type DepreciationReason =
  | "normal"
  | "final_trim"
  | "not_started"
  | "fully_depreciated"
  | "disposed";

export interface DepreciationPreviewItem {
  assetId: string;
  assetNo: string;
  assetName: string;
  amount: string;
  reason: DepreciationReason;
  expenseAccountCode: string;
}

export async function previewDepreciation(period: string) {
  return request<{ period: string; totalAmount: string; items: DepreciationPreviewItem[] }>(
    `/api/assets/depreciation?period=${encodeURIComponent(period)}`
  );
}

export async function runDepreciation(period: string) {
  return request<{ period: string; voucherId: string; totalAmount: string; accountingDate: string }>(
    "/api/assets/depreciation",
    { method: "POST", body: JSON.stringify({ period }) }
  );
}

export async function disposeFixedAsset(assetId: string, body: Record<string, unknown>) {
  return request<{
    voucherId: string;
    netBookValue: string;
    accumulatedDepreciation: string;
    gain: string | null;
  }>(`/api/assets/${encodeURIComponent(assetId)}/dispose`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export interface AgingBucketAmount {
  key: string;
  label: string;
  amount: string;
}

export interface AgingCounterpartyRow {
  counterpartyId: string | null;
  counterpartyName: string;
  total: string;
  overdue: string;
  itemCount: number;
  buckets: Record<string, string>;
}

export interface AgingItem {
  entryId: string;
  counterpartyName: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  summary: string;
  original: string;
  settled: string;
  open: string;
  agingDays: number;
  overdueDays: number;
  bucketKey: string;
}

export async function getAging(direction: "receivable" | "payable", asOf: string) {
  return request<{
    asOf: string;
    direction: string;
    buckets: AgingBucketAmount[];
    total: string;
    overdue: string;
    counterparties: AgingCounterpartyRow[];
    items: AgingItem[];
    truncated: boolean;
    truncatedHint: string | null;
  }>(`/api/settlement/aging?direction=${direction}&asOf=${encodeURIComponent(asOf)}`);
}

export interface SettlementCandidate {
  entryId: string;
  counterpartyId: string | null;
  counterpartyName: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  summary: string;
  original: string;
  settled: string;
  remaining: string;
}

export async function getSettlementOpenItems(direction: "receivable" | "payable", asOf: string) {
  return request<{
    direction: string;
    asOf: string;
    openItems: SettlementCandidate[];
    settleItems: SettlementCandidate[];
    truncated: boolean;
  }>(`/api/settlement/open-items?direction=${direction}&asOf=${encodeURIComponent(asOf)}`);
}

export async function settleEntries(body: {
  openEntryId: string;
  settleEntryId: string;
  amount?: string;
  settledOn?: string;
}) {
  return request<{ id: string; amount: string; openRemaining: string; settleRemaining: string }>(
    "/api/settlement/settle",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export interface SettlementRecord {
  id: string;
  openEntryId: string;
  settleEntryId: string;
  amount: string;
  settledOn: string;
}

/**
 * 某笔分录上的核销记录（V15）。
 *
 * `entryId` 既可以是欠款那一笔，也可以是核销方那一笔——两边都能查到同一条，
 * 因为用户从哪一侧点进来都应当看得见。
 */
export async function listSettlements(entryId: string) {
  return request<{ items: SettlementRecord[]; total: number }>(
    `/api/settlement/settlements?entryId=${encodeURIComponent(entryId)}`
  );
}

/**
 * 撤销核销（V15）。
 *
 * **核销错了以前改不了**——撤销接口一直存在，但前台拿不到要撤哪一条的 id。
 */
export async function unsettleEntry(settlementId: string) {
  return request<{ deleted: boolean; id: string }>(
    `/api/settlement/settlements/${encodeURIComponent(settlementId)}`,
    { method: "DELETE" }
  );
}

export interface ReconciliationItemView {
  itemType: "book_only_receipt" | "book_only_payment" | "bank_only_receipt" | "bank_only_payment";
  occurredOn: string;
  amount: string;
  description: string;
  sourceId: string | null;
}

export interface BalanceReconciliationView {
  bankAccount: { id: string; bankName: string; accountNo: string; accountCode: string };
  asOf: string;
  statementBalance: string;
  bookBalance: string;
  adjustedStatementBalance: string;
  adjustedBookBalance: string;
  difference: string;
  balanced: boolean;
  subtotals: {
    bookOnlyReceipt: string;
    bookOnlyPayment: string;
    bankOnlyReceipt: string;
    bankOnlyPayment: string;
  };
  items: ReconciliationItemView[];
  message: string;
  sharedAccountWarning: string | null;
}

export async function getBalanceReconciliation(
  bankAccountId: string,
  asOf: string,
  statementBalance: string
) {
  return request<BalanceReconciliationView>(
    `/api/banking/reconciliation/balance?bankAccountId=${encodeURIComponent(bankAccountId)}` +
      `&asOf=${encodeURIComponent(asOf)}&statementBalance=${encodeURIComponent(statementBalance)}`
  );
}

export async function closeBankReconciliation(body: {
  bankAccountId: string;
  asOf: string;
  statementBalance: string;
  notes?: string;
  acknowledgeDifference?: boolean;
}) {
  return request<BalanceReconciliationView & { reconciliationId: string }>(
    "/api/banking/reconciliation/close",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export interface RecurringVoucherView {
  id: string;
  name: string;
  startPeriod: string;
  endPeriod: string | null;
  summaryTemplate: string;
  status: "active" | "paused";
  lines: {
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    summary: string;
  }[];
}

export async function listRecurringVouchers() {
  return request<{ items: RecurringVoucherView[]; total: number }>("/api/recurring-vouchers");
}

export async function createRecurringVoucher(body: Record<string, unknown>) {
  return request<RecurringVoucherView>("/api/recurring-vouchers", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function setRecurringVoucherStatus(id: string, status: "active" | "paused") {
  return request<{ id: string; status: string }>(
    `/api/recurring-vouchers/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
}

export async function generateRecurringVouchers(period: string) {
  return request<{
    period: string;
    generated: { recurringId: string; name: string; voucherId: string | null }[];
    skipped: { recurringId: string; name: string; skippedReason: string | null }[];
  }>("/api/recurring-vouchers/generate", {
    method: "POST",
    body: JSON.stringify({ period })
  });
}
