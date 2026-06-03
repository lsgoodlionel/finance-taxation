/**
 * P7-B1 现金流前瞻 HTTP 路由
 * GET /api/forecast/cash?period=YYYY-MM
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { buildCashForecast, type CashForecastInput } from "./cash-forecast.js";

async function ledgerSumPrefix(companyId: string, prefix: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT coalesce(sum(debit::numeric - credit::numeric),0)::text n
     FROM ledger_entries WHERE company_id=$1 AND account_code LIKE $2`,
    [companyId, `${prefix}%`],
  );
  return Number(row?.n ?? 0);
}

export async function gatherCashForecastInput(companyId: string, period: string): Promise<CashForecastInput> {
  const [cashBalance, receivables, payables, taxLiabilityRaw, payroll] = await Promise.all([
    ledgerSumPrefix(companyId, "1002"),
    ledgerSumPrefix(companyId, "1122"),
    ledgerSumPrefix(companyId, "2202"),
    ledgerSumPrefix(companyId, "2221"),
    queryOne<{ net: string; ss: string }>(
      `SELECT coalesce(sum(net_pay),0)::text net,
              coalesce(sum(social_security_employee+social_security_employer+housing_fund_employee+housing_fund_employer),0)::text ss
       FROM payroll_records WHERE company_id=$1 AND period=$2`,
      [companyId, period],
    ),
  ]);

  return {
    cashBalance,
    receivables: Math.max(0, receivables),
    payables: Math.max(0, -payables),       // 应付为贷方余额
    taxLiability: Math.max(0, -taxLiabilityRaw),
    upcomingPayroll: Number(payroll?.net ?? 0),
    upcomingSocialSecurity: Number(payroll?.ss ?? 0),
  };
}

export async function getCashForecast(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;
  const input = await gatherCashForecastInput(cid, period);
  const forecast = buildCashForecast(input);
  json(res, 200, { period, input, forecast });
}
