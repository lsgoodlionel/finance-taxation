/**
 * 费用分析的 HTTP 接线（V13-D6）。
 *
 * - `GET /api/reports/expense-analysis?period=2026-09`
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { buildExpenseAnalysis } from "./expense-analysis.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function expenseAnalysisRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);

  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 应形如 2026-09" });
    return;
  }

  const analysis = await buildExpenseAnalysis(req.auth!.companyId, period);
  json(res, 200, {
    ...analysis,
    // 口径说明随数据一起返回：这张表读的是报销单，不经报销的费用
    // （会计直接做的凭证）不在里面。不说明白，两张表对不上时没人知道为什么。
    scopeNote: "统计口径：已批准及已付款的报销单，按费用发生日归期。不含未经报销直接入账的费用。"
  });
}
