/**
 * H4-w2 异常扫描接线：把纯核心 runAnomalyScan（detectors.ts）接到只读 HTTP 端点。
 *
 * 数据来源（company 隔离，均以整数分/ISO 日期字符串喂给纯核心）：
 *  - 重复付款   ← ledger_entries 贷记银行存款（1002%）的分录，summary 作为收款方近似标签
 *  - 发票断号   ← invoices 中本公司开具的销项发票（direction = 'output'）
 *  - 周末大额   ← ledger_entries 中落在周六/周日且发生额（取借贷两侧较大值）> 0 的分录
 *  - 税负率环比 ← ledger_entries 按月汇总应交税费（2221%）与营业收入科目净额
 *
 * 查不到 / 不适用的检测器一律传空数组，而不是省略字段——保持 AnomalyScanInput 形状稳定。
 */
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../../types.js";
import { query } from "../../../db/client.js";
import { json } from "../../../utils/http.js";
import {
  runAnomalyScan,
  type AnomalyFinding,
  type AnomalyScanInput,
  type AmountEntryInput,
  type InvoiceNumberInput,
  type PaymentEntryInput,
  type TaxBurdenPeriodInput
} from "./detectors.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;
const DEFAULT_LOOKBACK_DAYS = 90;
const TAX_BURDEN_LOOKBACK_MONTHS = 6;
const REVENUE_PREFIXES = ["6001", "6051", "6111", "6301"];
const TAX_PAYABLE_PREFIX = "2221";
const BANK_ACCOUNT_PREFIX = "1002";
const MS_PER_DAY = 86_400_000;
const CENTS_PER_YUAN = 100;

interface DateRange {
  /** 含 */
  start: string;
  /** 不含 */
  end: string;
}

/** 解析 period（YYYY-MM）为当月区间；未传时回退到近 90 天。调用方需先校验 period 格式。 */
function resolveDateRange(period: string | null): DateRange {
  if (period) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    const start = `${period}-01`;
    const end =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { start, end };
  }
  const now = new Date();
  const start = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY);
  const end = new Date(now.getTime() + MS_PER_DAY); // 含今天，区间上界取明天（不含）
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** 当前 UTC 账期标签（YYYY-MM），用于未传 period 时的税负率环比窗口右端点 */
function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 账期标签平移（如 "2026-07" 平移 -5 → "2026-02"） */
function shiftPeriodLabel(period: string, deltaMonths: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const total = year * 12 + (month - 1) + deltaMonths;
  const shiftedYear = Math.floor(total / 12);
  const shiftedMonth = (total % 12) + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}`;
}

/** 疑似重复付款所需的付款分录：贷记银行存款（1002%）的记账分录 */
async function fetchPaymentEntries(companyId: string, range: DateRange): Promise<PaymentEntryInput[]> {
  const rows = await query<{
    id: string;
    summary: string;
    entry_date: string;
    credit: string;
    account_code: string;
  }>(
    `select id, summary, to_char(entry_date, 'YYYY-MM-DD') as entry_date, credit, account_code
     from ledger_entries
     where company_id = $1 and account_code like $2 and credit > 0
       and entry_date >= $3 and entry_date < $4
     order by entry_date`,
    [companyId, `${BANK_ACCOUNT_PREFIX}%`, range.start, range.end]
  );
  return rows.map((r) => ({
    id: r.id,
    payeeName: r.summary,
    amountCents: Math.round(Number(r.credit) * CENTS_PER_YUAN),
    entryDate: r.entry_date,
    accountCode: r.account_code
  }));
}

/** 发票断号所需的号段：本公司开具的销项发票（进项发票号段来自不同销方，比较断号无意义） */
async function fetchInvoiceNumbers(companyId: string, range: DateRange): Promise<InvoiceNumberInput[]> {
  const rows = await query<{ id: string; invoice_no: string; invoice_code: string | null }>(
    `select id, invoice_no, invoice_code
     from invoices
     where company_id = $1 and direction = 'output'
       and invoice_date >= $2 and invoice_date < $3
     order by invoice_date`,
    [companyId, range.start, range.end]
  );
  return rows.map((r) => ({
    id: r.id,
    invoiceNo: r.invoice_no,
    invoiceCode: r.invoice_code ?? undefined
  }));
}

/** 周末大额交易所需的分录：落在周六/周日、发生额（借贷两侧取大者）> 0 的记账分录 */
async function fetchWeekendAmountEntries(companyId: string, range: DateRange): Promise<AmountEntryInput[]> {
  const rows = await query<{ id: string; entry_date: string; summary: string; amount: string }>(
    `select id, to_char(entry_date, 'YYYY-MM-DD') as entry_date, summary, greatest(debit, credit) as amount
     from ledger_entries
     where company_id = $1 and entry_date >= $2 and entry_date < $3
       and extract(dow from entry_date) in (0, 6)
       and greatest(debit, credit) > 0
     order by entry_date`,
    [companyId, range.start, range.end]
  );
  return rows.map((r) => ({
    id: r.id,
    entryDate: r.entry_date,
    amountCents: Math.round(Number(r.amount) * CENTS_PER_YUAN),
    summary: r.summary
  }));
}

/** 税负率环比所需的账期序列：按月汇总应交税费（2221%）贷方净额 / 营业收入科目贷方净额 */
async function fetchTaxBurdenPeriods(companyId: string, endPeriod: string): Promise<TaxBurdenPeriodInput[]> {
  const startPeriod = shiftPeriodLabel(endPeriod, -(TAX_BURDEN_LOOKBACK_MONTHS - 1));
  const revenueLikeClauses = REVENUE_PREFIXES.map((_, i) => `account_code like $${i + 3}`).join(" or ");
  const startParamIndex = REVENUE_PREFIXES.length + 3;
  const rows = await query<{ period: string; tax: string; revenue: string }>(
    `select to_char(entry_date, 'YYYY-MM') as period,
            sum(case when account_code like $2 then credit - debit else 0 end) as tax,
            sum(case when ${revenueLikeClauses} then credit - debit else 0 end) as revenue
     from ledger_entries
     where company_id = $1
       and to_char(entry_date, 'YYYY-MM') between $${startParamIndex} and $${startParamIndex + 1}
     group by period
     order by period`,
    [companyId, `${TAX_PAYABLE_PREFIX}%`, ...REVENUE_PREFIXES.map((p) => `${p}%`), startPeriod, endPeriod]
  );
  return rows.map((r) => ({
    period: r.period,
    taxAmountCents: Math.round(Number(r.tax) * CENTS_PER_YUAN),
    revenueCents: Math.round(Number(r.revenue) * CENTS_PER_YUAN)
  }));
}

function countBySeverity(findings: readonly AnomalyFinding[]): Record<string, number> {
  const initial: Record<string, number> = { info: 0, warning: 0, alert: 0 };
  return findings.reduce((acc, finding) => ({ ...acc, [finding.severity]: (acc[finding.severity] ?? 0) + 1 }), initial);
}

/**
 * GET /api/anomaly/scan?period=YYYY-MM
 * 异常检测扫描（H4-w2）：拉取付款/发票/大额/税负数据，喂给纯核心 runAnomalyScan，
 * 只读、不落库。period 缺省时回退到近 90 天窗口；查不到数据的检测器均以空数组参与聚合。
 */
export async function anomalyScanRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const periodParam = url.searchParams.get("period");
  if (periodParam && !PERIOD_LABEL.test(periodParam)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }

  const companyId = req.auth!.companyId;
  const range = resolveDateRange(periodParam);
  const taxBurdenEndPeriod = periodParam ?? currentPeriodLabel();

  const [payments, invoices, weekendEntries, taxBurdenPeriods] = await Promise.all([
    fetchPaymentEntries(companyId, range),
    fetchInvoiceNumbers(companyId, range),
    fetchWeekendAmountEntries(companyId, range),
    fetchTaxBurdenPeriods(companyId, taxBurdenEndPeriod)
  ]);

  const input: AnomalyScanInput = { payments, invoices, weekendEntries, taxBurdenPeriods };
  const findings = runAnomalyScan(input);

  json(res, 200, {
    period: periodParam ?? null,
    range,
    findings,
    total: findings.length,
    bySeverity: countBySeverity(findings)
  });
}
