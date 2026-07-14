import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { forecastCashFlow } from "./cash-forecast.js";
import { comparePeriods, budgetVariance } from "./period-comparison.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;
const REVENUE_PREFIXES = ["6001", "6051", "6111", "6301"];
const EXPENSE_PREFIXES = ["5601", "6601", "6602", "6603", "6711"];

/**
 * GET /api/analytics/cash-forecast?periods=3
 * 现金流预测（E2）：以 1001/1002 现金及银行存款账户的按月净现金流为历史，
 * 线性回归外推未来 N 期。
 */
export async function cashForecastRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const periods = Math.min(24, Math.max(1, Number(url.searchParams.get("periods")) || 3));

  const rows = await query<{ month: string; net: string }>(
    `select to_char(entry_date, 'YYYY-MM') as month, sum(debit - credit) as net
     from ledger_entries
     where company_id = $1 and (account_code like '1001%' or account_code like '1002%')
     group by month order by month`,
    [req.auth!.companyId]
  );
  const history = rows.map((r) => Number(r.net));
  const forecast = forecastCashFlow(history, periods);

  json(res, 200, {
    history: rows.map((r, i) => ({ month: r.month, net: history[i] })),
    slope: forecast.fit.slope,
    predictions: forecast.predictions
  });
}

/**
 * GET /api/analytics/revenue-comparison?current=2026-05&previous=2026-04
 * 收入同比/环比（E1）：比对两个属期的营业收入（6001/6051/6111/6301 的贷方净额）。
 */
export async function revenueComparisonRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const current = url.searchParams.get("current") || "";
  const previous = url.searchParams.get("previous") || "";
  if (!PERIOD_LABEL.test(current) || !PERIOD_LABEL.test(previous)) {
    json(res, 400, { error: "current and previous must look like YYYY-MM" });
    return;
  }

  const revenueFor = async (period: string): Promise<number> => {
    const likeClauses = REVENUE_PREFIXES.map((_, i) => `account_code like $${i + 3}`).join(" or ");
    const rows = await query<{ revenue: string }>(
      `select coalesce(sum(credit - debit), 0) as revenue
       from ledger_entries
       where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2 and (${likeClauses})`,
      [req.auth!.companyId, period, ...REVENUE_PREFIXES.map((p) => `${p}%`)]
    );
    return Number(rows[0]?.revenue ?? 0);
  };

  const comparison = comparePeriods(await revenueFor(current), await revenueFor(previous));
  json(res, 200, { currentPeriod: current, previousPeriod: previous, ...comparison });
}

/**
 * GET /api/analytics/budget-variance?period=2026-05&budget=100000&category=5601,6601
 * 预算差异（E1）：比对属期实际发生额（默认费用科目前缀）与传入预算金额。
 */
export async function budgetVarianceRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") || "";
  const budget = Number(url.searchParams.get("budget"));
  const categoryParam = url.searchParams.get("category");
  const prefixes = categoryParam
    ? categoryParam.split(",").map((p) => p.trim()).filter(Boolean)
    : EXPENSE_PREFIXES;

  if (!PERIOD_LABEL.test(period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }
  if (!Number.isFinite(budget) || budget < 0) {
    json(res, 400, { error: "budget must be a non-negative number" });
    return;
  }
  if (prefixes.length === 0) {
    json(res, 400, { error: "category must not be empty" });
    return;
  }

  const likeClauses = prefixes.map((_, i) => `account_code like $${i + 3}`).join(" or ");
  const rows = await query<{ actual: string }>(
    `select coalesce(sum(debit - credit), 0) as actual
     from ledger_entries
     where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2 and (${likeClauses})`,
    [req.auth!.companyId, period, ...prefixes.map((p) => `${p}%`)]
  );
  const actual = Number(rows[0]?.actual ?? 0);
  const actualCents = Math.round(actual * 100);
  const budgetCents = Math.round(budget * 100);
  const result = budgetVariance(actualCents, budgetCents);

  json(res, 200, {
    period,
    category: prefixes,
    actualCents,
    budgetCents,
    actual: actualCents / 100,
    budget: budgetCents / 100,
    variance: result.variance,
    utilization: result.utilization,
    status: result.status
  });
}
