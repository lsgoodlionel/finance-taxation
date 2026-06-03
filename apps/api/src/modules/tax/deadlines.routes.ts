/**
 * P7-B3 申报到期提醒 HTTP 路由
 * GET /api/tax/deadlines?period=YYYY-MM
 */

import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { buildTaxDeadlines } from "./deadlines.js";

export async function getTaxDeadlines(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;

  const filed = await query<{ tax_type: string }>(
    "SELECT DISTINCT tax_type FROM tax_declaration_submissions WHERE company_id=$1 AND filing_period=$2",
    [cid, period],
  );

  const deadlines = buildTaxDeadlines({
    period,
    today: new Date().toISOString().slice(0, 10),
    filedTypes: filed.map((f) => f.tax_type),
  });

  const urgentCount = deadlines.filter((d) => d.urgent).length;
  json(res, 200, { period, deadlines, urgentCount });
}
