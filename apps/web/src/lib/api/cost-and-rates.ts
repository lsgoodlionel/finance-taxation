/**
 * 成本中心 / 税率 / 折旧纳税调整 / 多币种 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── V12-D1 成本中心 / D2 税率与账簿口径底稿 ──────────────────────────────

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  notes: string;
  isActive: boolean;
}

export async function listCostCenters(includeInactive = false) {
  const qs = includeInactive ? "?includeInactive=true" : "";
  return request<{ items: CostCenter[]; total: number }>(`/api/cost-centers${qs}`);
}

export async function createCostCenter(body: { code: string; name: string; notes?: string }) {
  return request<CostCenter>("/api/cost-centers", { method: "POST", body: JSON.stringify(body) });
}

export async function setCostCenterActive(id: string, isActive: boolean) {
  return request<{ id: string; isActive: boolean }>(`/api/cost-centers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export interface CostCenterReportRow {
  costCenterId: string | null;
  costCenterName: string;
  total: string;
  share: number;
  accounts: { accountCode: string; accountName: string; amount: string }[];
}

export async function getCostCenterReport(period: string) {
  return request<{
    period: string;
    total: string;
    unassigned: string;
    unassignedNotice: string | null;
    rows: CostCenterReportRow[];
  }>(`/api/reports/cost-centers?period=${encodeURIComponent(period)}`);
}

export interface TaxRateView {
  id: string;
  taxType: string;
  code: string;
  name: string;
  rate: number;
  levyRate: number | null;
  /** 算税实际该用的比例——不必自己判断有没有减征。 */
  effectiveRate: number;
  description: string;
  taxpayerType: string | null;
  applicableScope: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isSystem: boolean;
}

export async function listTaxRates(taxType: string, on?: string) {
  const params = new URLSearchParams({ taxType });
  if (on) params.set("on", on);
  return request<{ items: TaxRateView[]; total: number; on: string | null }>(
    `/api/tax/rates?${params.toString()}`
  );
}

/**
 * 给一档税率设失效日（停用）。
 *
 * **没有删除接口**：历史凭证要按当时适用的那一档解释，删掉旧档
 * 会让重算旧属期的底稿全部算错。停用只是划一条止日。
 */
export async function expireTaxRate(rateId: string, effectiveTo: string) {
  return request<{ rate: TaxRateView }>(`/api/tax/rates/${encodeURIComponent(rateId)}/expire`, {
    method: "POST",
    body: JSON.stringify({ effectiveTo })
  });
}

export interface LedgerVatPaperView {
  ledger: {
    period: string;
    outputTax: string;
    inputTax: string;
    inputTransferOut: string;
    taxPaid: string;
    simplified: string;
    payable: string;
    lines: {
      entryId: string;
      voucherId: string;
      entryDate: string;
      summary: string;
      accountCode: string;
      accountName: string;
      amount: string;
      role: string;
    }[];
  };
  items: { payable: string; lineCount: number } | null;
  reconciliation: {
    consistent: boolean;
    message: string;
    ledgerPayable?: string;
    itemsPayable?: string;
    difference?: string;
  };
}

export async function getLedgerVatPaper(period: string) {
  return request<LedgerVatPaperView>(
    `/api/tax/vat-working-paper/ledger?period=${encodeURIComponent(period)}`
  );
}

// ── V12-D4 折旧纳税调整明细表（A105080）──────────────────────────────────

export interface TaxDepreciationRow {
  assetId: string;
  assetNo: string;
  assetName: string;
  category: string;
  originalCost: string;
  accountingLifeMonths: number;
  taxLifeMonths: number;
  accountingDepreciation: string;
  taxDeduction: string;
  adjustment: string;
  reason: string;
  explanation: string;
}

export async function getTaxDepreciationReport(taxYear: number) {
  return request<{
    taxYear: number;
    accountingTotal: string;
    taxTotal: string;
    adjustmentTotal: string;
    summary: string;
    rows: TaxDepreciationRow[];
  }>(`/api/assets/tax-depreciation?taxYear=${taxYear}`);
}

// ─── 多币种（V12-D5）────────────────────────────────────────────────

export interface ExchangeRate {
  id: string;
  currency: string;
  rateDate: string;
  /** 整数标度值（乘 1e6），与库一致。 */
  rate: number;
  /** 人读的小数形式，直接显示，避免每个调用方各除一遍。 */
  rateDisplay: string;
  source: string;
  note: string | null;
}

export interface RevaluationLine {
  accountCode: string;
  accountName: string;
  currency: string;
  foreignBalance: string;
  baseBookBalance: string;
  closingRate: string | null;
  difference: string | null;
  needsAdjustment: boolean;
  isGain: boolean | null;
  reason: string;
}

export interface RevaluationPreview {
  asOfDate: string;
  baseCurrency: string;
  /** 缺汇率的币种。非空时后端不生成凭证——半张调汇凭证比不调更难查。 */
  missingRates: string[];
  netGainLoss: string;
  lines: RevaluationLine[];
}

export async function listExchangeRates(currency?: string) {
  const suffix = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return request<{ rates: ExchangeRate[]; baseCurrency: string }>(`/api/currency/rates${suffix}`);
}

export async function upsertExchangeRate(body: {
  currency: string;
  rateDate: string;
  rate: number;
  note?: string;
}) {
  return request<ExchangeRate>("/api/currency/rates", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function previewRevaluation(asOfDate: string) {
  return request<RevaluationPreview>(
    `/api/currency/revaluation?asOfDate=${encodeURIComponent(asOfDate)}`
  );
}

export async function createRevaluationVoucher(asOfDate: string) {
  return request<{ voucherId: string; lineCount: number; status: string; notice: string }>(
    "/api/currency/revaluation",
    { method: "POST", body: JSON.stringify({ asOfDate }) }
  );
}
