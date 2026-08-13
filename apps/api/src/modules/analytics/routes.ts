import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { EXCLUDE_PERIOD_CLOSING_SQL } from "../ledger/closing-entries.js";
import { forecastCashFlow } from "./cash-forecast.js";
import { comparePeriods, budgetVariance } from "./period-comparison.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;

/**
 * 收入科目前缀（主营业务收入 / 其他业务收入 / 投资收益 / 营业外收入），与
 * reports/profit-accounts.ts 的 REVENUE_ACCOUNT_PREFIXES 同源。
 */
export const REVENUE_PREFIXES = ["6001", "6051", "6111", "6301"];

// V12-D3：这里曾有一个 REVENUE_EXCLUDED_PREFIXES，把主营业务成本 `6001c` 与
// 管理费用 `6301e` 从 `6001%` / `6301%` 的 like 匹配里剔出去。国标化之后它们是
// `6401` / `6602`，与收入前缀再无交集，排除子句已删除。

/**
 * 默认费用科目前缀：税金及附加 6403、销售费用 6201、管理费用 6602、
 * 财务费用 6603、职工薪酬（成本）6601、营业外支出 6711。
 *
 * 旧口径写的是 5601/6601/6602/6603/6711——其中 5601 在科目表里根本不存在，
 * 6601 也不是销售费用而是职工薪酬，于是「实际发生额」长期漏计销售费用、
 * 管理费用与财务费用。（6602/6603 当时也不存在；D3 之后它们成了管理费用与
 * 财务费用的真实编码，但那是巧合，不是当年那份口径写对了。）
 *
 * 不含主营业务成本 6401 与所得税费用 6801：预算差异比的是期间费用，
 * 与 reports/profit-accounts.ts 的 `expense` 口径（同样剔除 6801）保持一致。
 */
export const EXPENSE_PREFIXES = ["6403", "6201", "6602", "6603", "6601", "6711"];

/**
 * GET /api/analytics/cash-forecast?periods=3
 * 现金流预测（E2）：以 1001/1002 现金及银行存款账户的按月净现金流为历史，
 * 线性回归外推未来 N 期。
 */
export async function cashForecastRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const periods = Math.min(24, Math.max(1, Number(url.searchParams.get("periods")) || 3));

  // 不排除结转损益分录（口径见 ledger/closing-entries.ts）：这里只取 1001/1002
  // 货币资金科目的按月净现金流，而结转分录只涉及 6xxx 与 3131，前缀不相交，
  // 加过滤是死代码。语义上现金流也不是「经营成果」，本就不该排除。
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
 * 收入同比/环比（E1）：比对两个属期的营业收入（6001/6051/6111/6301 的贷方净额，
 * 排除前缀重叠的主营业务成本 6001c 与管理费用 6301e）。
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
    const includeClauses = REVENUE_PREFIXES.map((_, i) => `account_code like $${i + 3}`).join(" or ");
    // 排除结转损益分录（口径见 ledger/closing-entries.ts）：按属期聚合收入，
    // 结转分录会把本期收入冲成 0，两期都结转后环比变成 0 比 0。
    const rows = await query<{ revenue: string }>(
      `select coalesce(sum(credit - debit), 0) as revenue
       from ledger_entries
       where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2
         and ${EXCLUDE_PERIOD_CLOSING_SQL}
         and (${includeClauses})`,
      [req.auth!.companyId, period, ...REVENUE_PREFIXES.map((p) => `${p}%`)]
    );
    return Number(rows[0]?.revenue ?? 0);
  };

  const comparison = comparePeriods(await revenueFor(current), await revenueFor(previous));
  json(res, 200, { currentPeriod: current, previousPeriod: previous, ...comparison });
}

/**
 * GET /api/analytics/budget-variance?period=2026-05&budget=100000&category=6201,6301e
 * 预算差异（E1）：比对属期实际发生额（默认 EXPENSE_PREFIXES 费用科目前缀）与传入预算金额。
 * category 传入的前缀按科目表口径书写，例如 6201（销售费用）、6301e（管理费用）、6401（财务费用）。
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
  // 排除结转损益分录（口径见 ledger/closing-entries.ts）：按属期聚合费用发生额，
  // 结转分录会把本期费用冲成 0，实际发生额恒为 0 → 预算执行率永远 0%、永远「未超支」。
  const rows = await query<{ actual: string }>(
    `select coalesce(sum(debit - credit), 0) as actual
     from ledger_entries
     where company_id = $1 and to_char(entry_date, 'YYYY-MM') = $2
       and ${EXCLUDE_PERIOD_CLOSING_SQL}
       and (${likeClauses})`,
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
