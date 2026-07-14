import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { checkTaxConsistency } from "./consistency.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;
const REVENUE_PREFIXES = ["6001", "6051", "6111", "6301"];
const DEFAULT_TOLERANCE_CENTS = 100;
const DEFAULT_ALERT_THRESHOLD_CENTS = 10_000;

interface InvoiceTotalsRow {
  direction: string;
  sum_amount: string | null;
  sum_tax_amount: string | null;
}

async function loadInvoiceTotals(companyId: string, period: string) {
  const rows = await query<InvoiceTotalsRow>(
    `select direction, sum(amount) as sum_amount, sum(tax_amount) as sum_tax_amount
     from invoices
     where company_id = $1 and to_char(invoice_date, 'YYYY-MM') = $2
     group by direction`,
    [companyId, period]
  );
  const output = rows.find((r) => r.direction === "output");
  const input = rows.find((r) => r.direction === "input");
  return {
    invoiceOutputTaxCents: Math.round(Number(output?.sum_tax_amount ?? 0) * 100),
    invoiceSalesAmountCents: Math.round(Number(output?.sum_amount ?? 0) * 100),
    invoiceInputTaxCents: Math.round(Number(input?.sum_tax_amount ?? 0) * 100)
  };
}

async function loadLedgerRevenueCents(companyId: string, period: string): Promise<number> {
  const likeClauses = REVENUE_PREFIXES.map((_, i) => `account_code like $${i + 3}`).join(" or ");
  const rows = await query<{ revenue: string }>(
    `select coalesce(sum(credit - debit), 0) as revenue
     from ledger_entries
     where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2 and (${likeClauses})`,
    [companyId, period, ...REVENUE_PREFIXES.map((p) => `${p}%`)]
  );
  return Math.round(Number(rows[0]?.revenue ?? 0) * 100);
}

/**
 * GET /api/tax-integration/consistency?period=2026-05&toleranceCents=100&alertThresholdCents=10000
 * 票税一致性核对：发票（销项税/进项税/销售额）vs 增值税申报数 vs 账面收入。
 * 申报数据尚未接入稳定字段来源，暂以 0 占位并在响应中标注 declaredDataAvailable:false。
 */
export async function taxConsistencyRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") || "";
  if (!PERIOD_LABEL.test(period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }
  const toleranceCents = Number(url.searchParams.get("toleranceCents")) || DEFAULT_TOLERANCE_CENTS;
  const alertThresholdCents =
    Number(url.searchParams.get("alertThresholdCents")) || DEFAULT_ALERT_THRESHOLD_CENTS;

  const companyId = req.auth!.companyId;
  const invoiceTotals = await loadInvoiceTotals(companyId, period);
  const ledgerRevenueCents = await loadLedgerRevenueCents(companyId, period);

  const report = checkTaxConsistency({
    period,
    ...invoiceTotals,
    declaredOutputTaxCents: 0,
    declaredInputTaxCents: 0,
    ledgerRevenueCents,
    toleranceCents,
    alertThresholdCents
  });

  json(res, 200, {
    ...report,
    declaredDataAvailable: false,
    notes: ["申报数据未接入"]
  });
}
