/**
 * 会计年度与年末结转的 HTTP 接线（V12-B5）。
 *
 * - `GET  /api/ledger/fiscal-years`            列出财年及结账状态
 * - `POST /api/ledger/fiscal-years/:year/close` 年末结转（借 3131 / 贷 3141）
 * - `GET  /api/ledger/balance-check?asOf=…`    资产负债表恒等式自检
 *
 * ## balance-check 为什么在 ledger 而不在 reports
 *
 * 它算的是总账层面的恒等式，数据源是 ledger_entries + accounts，与报表渲染无关。
 * 报表侧要做的是把 `difference` 显式列成一行（ERPNext 的 "Unclosed Fiscal Years
 * Profit/Loss"），消费本接口或直接 import `checkBalanceSheet` 即可 —— reports/
 * 本轮属他人车道，那一步的接线写进了交付报告。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { closeFiscalYear } from "./annual-closing.js";
import { checkBalanceSheet } from "./balance-check.js";
import { listFiscalYears } from "./fiscal-year.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function listFiscalYearsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const fiscalYears = await listFiscalYears(req.auth!.companyId);
  json(res, 200, { fiscalYears });
}

export async function closeFiscalYearRoute(
  req: ApiRequest,
  res: ServerResponse,
  yearParam: string
): Promise<void> {
  const year = Number(yearParam);
  if (!Number.isInteger(year)) {
    json(res, 400, { error: "会计年度必须是四位数字，例如 2026", code: "FISCAL_YEAR_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    closeFiscalYear(client, {
      companyId: req.auth!.companyId,
      year,
      now: new Date().toISOString(),
      closedBy: req.auth!.userId
    })
  );

  if (!result.ok) {
    json(res, 400, { error: result.failure.message, ...result.failure });
    return;
  }
  json(res, result.alreadyClosed ? 200 : 201, {
    alreadyClosed: result.alreadyClosed,
    year: result.year,
    netProfit: result.netProfit,
    voucherId: result.voucherId,
    fiscalYear: result.fiscalYear
  });
}

export async function balanceCheckRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const asOf = url.searchParams.get("asOf") || new Date().toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(asOf)) {
    json(res, 400, { error: "asOf 必须形如 YYYY-MM-DD" });
    return;
  }
  const check = await withTransaction((client) =>
    checkBalanceSheet(client, req.auth!.companyId, asOf)
  );
  json(res, 200, check);
}
