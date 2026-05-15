import type { ServerResponse } from "node:http";
import type { ReportSnapshot } from "@finance-taxation/domain-model";
import { CHART_OF_ACCOUNTS } from "../accounts/routes.js";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { listCompanyRiskFindings } from "../risk/routes.js";
import { listCompanyTaxpayerProfiles } from "../tax/routes.js";
import { listCompanyLedgerEntries } from "../vouchers/routes.js";
import { resolveActiveTaxpayerProfile } from "../tax/profile.js";
import {
  buildBalanceSheetReport,
  buildCashFlowReport,
  buildProfitStatementReport
} from "./summary.js";
import { buildChairmanReportSummary } from "./chairman-summary.js";
import { buildReportDiff } from "./snapshots.js";

interface ReportSnapshotRow {
  id: string;
  company_id: string;
  report_type: ReportSnapshot["reportType"];
  period_type: ReportSnapshot["periodType"];
  period_label: string;
  snapshot_date: string | Date;
  payload: ReportSnapshot["payload"];
  created_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSnapshotRow(row: ReportSnapshotRow): ReportSnapshot {
  return {
    id: row.id,
    companyId: row.company_id,
    reportType: row.report_type,
    periodType: row.period_type,
    periodLabel: row.period_label,
    snapshotDate: (toIsoString(row.snapshot_date) || "").slice(0, 10),
    payload: row.payload,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

function resolvePeriod(req: ApiRequest) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const periodType = url.searchParams.get("periodType") || "month";
  const year = Number(url.searchParams.get("year") || new Date().getUTCFullYear());
  const month = Number(url.searchParams.get("month") || new Date().getUTCMonth() + 1);
  const quarter = Number(url.searchParams.get("quarter") || Math.ceil(month / 3));

  if (periodType === "year") {
    return {
      periodLabel: `${year}`,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`
    };
  }
  if (periodType === "quarter") {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      periodLabel: `${year} Q${quarter}`,
      startDate: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      endDate: new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10)
    };
  }
  return {
    periodLabel: `${year}-${String(month).padStart(2, "0")}`,
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  };
}

export async function getBalanceSheet(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const period = resolvePeriod(req);
  const entries = await listCompanyLedgerEntries(companyId);
  const report = buildBalanceSheetReport({
    periodLabel: period.periodLabel,
    asOfDate: period.endDate,
    entries
  });
  return json(res, 200, {
    ...report,
    accountCatalogSize: CHART_OF_ACCOUNTS.length
  });
}

export async function getProfitStatement(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const period = resolvePeriod(req);
  const entries = (await listCompanyLedgerEntries(companyId)).filter(
    (entry) => entry.entryDate >= period.startDate && entry.entryDate <= period.endDate
  );
  return json(
    res,
    200,
    buildProfitStatementReport({
      periodLabel: period.periodLabel,
      entries
    })
  );
}

export async function getCashFlow(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const period = resolvePeriod(req);
  const entries = (await listCompanyLedgerEntries(companyId)).filter(
    (entry) => entry.entryDate >= period.startDate && entry.entryDate <= period.endDate
  );
  return json(
    res,
    200,
    buildCashFlowReport({
      periodLabel: period.periodLabel,
      entries
    })
  );
}

async function buildReportPayload(
  companyId: string,
  reportType: ReportSnapshot["reportType"],
  period: ReturnType<typeof resolvePeriod>
) {
  const entries = await listCompanyLedgerEntries(companyId);
  if (reportType === "balance_sheet") {
    return buildBalanceSheetReport({
      periodLabel: period.periodLabel,
      asOfDate: period.endDate,
      entries
    });
  }
  const periodEntries = entries.filter(
    (entry) => entry.entryDate >= period.startDate && entry.entryDate <= period.endDate
  );
  if (reportType === "profit_statement") {
    return buildProfitStatementReport({
      periodLabel: period.periodLabel,
      entries: periodEntries
    });
  }
  return buildCashFlowReport({
    periodLabel: period.periodLabel,
    entries: periodEntries
  });
}

export async function createReportSnapshot(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const input = (req.body ?? {}) as {
    reportType?: ReportSnapshot["reportType"];
    periodType?: ReportSnapshot["periodType"];
  };
  const reportType = (input.reportType || "balance_sheet") as ReportSnapshot["reportType"];
  const period = resolvePeriod(req);
  const payload = await buildReportPayload(companyId, reportType, period);
  const id = `report-snapshot-${Date.now()}`;
  const snapshot = await withTransaction(async (client) => {
    await client.query(
      `
        insert into report_snapshots (
          id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (company_id, report_type, period_type, period_label)
        do update set snapshot_date = excluded.snapshot_date, payload = excluded.payload, created_at = excluded.created_at
      `,
      [
        id,
        companyId,
        reportType,
        input.periodType || "month",
        period.periodLabel,
        period.endDate,
        JSON.stringify(payload),
        new Date().toISOString()
      ]
    );
    const row = await client.query<ReportSnapshotRow>(
      `
        select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
        from report_snapshots
        where company_id = $1 and report_type = $2 and period_type = $3 and period_label = $4
      `,
      [companyId, reportType, input.periodType || "month", period.periodLabel]
    );
    return mapSnapshotRow(row.rows[0]!);
  });
  return json(res, 201, snapshot);
}

export async function listReportSnapshots(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const reportType = url.searchParams.get("reportType");
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (reportType) {
    params.push(reportType);
    where += ` and report_type = $${params.length}`;
  }
  const rows = await query<ReportSnapshotRow>(
    `
      select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
      from report_snapshots
      ${where}
      order by snapshot_date desc, created_at desc
    `,
    params
  );
  const items = rows.map(mapSnapshotRow);
  return json(res, 200, { items, total: items.length });
}

export async function getReportDiff(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const fromSnapshotId = url.searchParams.get("fromSnapshotId");
  const toSnapshotId = url.searchParams.get("toSnapshotId");
  if (!fromSnapshotId || !toSnapshotId) {
    return json(res, 400, { error: "fromSnapshotId and toSnapshotId are required" });
  }
  const [fromRow, toRow] = await Promise.all([
    queryOne<ReportSnapshotRow>(
      `
        select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
        from report_snapshots where company_id = $1 and id = $2
      `,
      [companyId, fromSnapshotId]
    ),
    queryOne<ReportSnapshotRow>(
      `
        select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
        from report_snapshots where company_id = $1 and id = $2
      `,
      [companyId, toSnapshotId]
    )
  ]);
  if (!fromRow || !toRow) {
    return json(res, 404, { error: "Report snapshot not found" });
  }
  const diff = buildReportDiff(mapSnapshotRow(fromRow), mapSnapshotRow(toRow));
  return json(res, 200, diff);
}

export async function getChairmanReportSummary(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const snapshotId = url.searchParams.get("snapshotId");
  if (!snapshotId) {
    return json(res, 400, { error: "snapshotId is required" });
  }
  const snapshotRow = await queryOne<ReportSnapshotRow>(
    `
      select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
      from report_snapshots
      where company_id = $1 and id = $2
    `,
    [companyId, snapshotId]
  );
  if (!snapshotRow) {
    return json(res, 404, { error: "Report snapshot not found" });
  }
  const [profiles, findings] = await Promise.all([
    listCompanyTaxpayerProfiles(companyId),
    listCompanyRiskFindings(companyId)
  ]);
  const snapshot = mapSnapshotRow(snapshotRow);
  const profile = resolveActiveTaxpayerProfile(profiles, snapshot.snapshotDate);
  return json(
    res,
    200,
    buildChairmanReportSummary({
      snapshot,
      taxpayerProfile: profile,
      findings
    })
  );
}

export async function getPrintableReport(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const snapshotId = url.searchParams.get("snapshotId");
  if (!snapshotId) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("snapshotId is required");
    return;
  }
  const snapshotRow = await queryOne<ReportSnapshotRow>(
    `
      select id, company_id, report_type, period_type, period_label, snapshot_date, payload, created_at
      from report_snapshots
      where company_id = $1 and id = $2
    `,
    [companyId, snapshotId]
  );
  if (!snapshotRow) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Report snapshot not found");
    return;
  }
  const snapshot = mapSnapshotRow(snapshotRow);
  const html = `<!doctype html>
  <html lang="zh-CN">
  <head><meta charset="utf-8"><title>报表打印 - ${snapshot.periodLabel}</title></head>
  <body style="font-family:Arial,sans-serif;padding:24px;color:#222;">
    <h1>财务报表打印版</h1>
    <p>报表类型：${snapshot.reportType}</p>
    <p>期间：${snapshot.periodLabel}</p>
    <p>快照日期：${snapshot.snapshotDate}</p>
    <pre style="white-space:pre-wrap;background:#f7f7f7;padding:16px;border:1px solid #ddd;">${JSON.stringify(snapshot.payload, null, 2)}</pre>
  </body></html>`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}
