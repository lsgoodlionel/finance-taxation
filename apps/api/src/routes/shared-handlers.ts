/**
 * 几个不属于任何单一领域的 handler：健康探针、前端引导、月结资料包 HTML。
 *
 * 自 `registry.ts` 拆出（V15/P2）。它们直接写在路由表文件里，
 * 让那个文件同时承担「路由目录」和「实现」两件事。
 */
import type { RouteHandler } from "../router/router.js";
import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { buildClosingPackageExport, buildClosingPackageHtml } from "../modules/packages/closing-bundle.js";
import { listCompanyRiskFindings } from "../modules/risk/routes.js";
import { json } from "../utils/http.js";

export const healthHandler: RouteHandler = async (_req, res) => {
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await query("SELECT 1");
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return json(res, dbOk ? 200 : 503, {
    ok: dbOk,
    service: env.appName,
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

export const bootstrapHandler: RouteHandler = (_req, res) =>
  json(res, 200, {
    appName: env.appName,
    phase: "sprint-0",
    nextTargets: ["business_events", "tasks", "rbac", "chairman_dashboard"]
  });

export const closingBundleHandler: RouteHandler = async (req, res) => {
  const url = new URL(req.url || "/", `http://${env.host}:${env.port}`);
  const kind = (url.searchParams.get("kind") || "month_end") as "month_end" | "audit" | "inspection";
  const period = url.searchParams.get("period") || "2026-05";
  const companyId = req.auth!.companyId;
  const snapshotRows = await query<{ id: string }>(
    `
      select id
      from report_snapshots
      where company_id = $1 and period_label = $2
      order by snapshot_date desc, created_at desc
    `,
    [companyId, period]
  );
  const taxBatchRows = await query<{ id: string }>(
    `
      select id
      from tax_filing_batches
      where company_id = $1 and filing_period = $2
      order by created_at desc
    `,
    [companyId, period]
  );
  const rndRows = await query<{ id: string }>(
    `
      select id
      from rnd_projects
      where company_id = $1 and (
        started_on like $2
        or coalesce(ended_on::text, '') like $2
      )
      order by created_at desc
    `,
    [companyId, `${period}%`]
  );
  const findings = await listCompanyRiskFindings(companyId);
  const bundle = buildClosingPackageExport(kind, period, {
    reportSnapshotIds: snapshotRows.map((item) => item.id),
    taxBatchIds: taxBatchRows.map((item) => item.id),
    riskFindingIds: findings
      .filter((item) => item.status === "open" && item.createdAt.startsWith(period.slice(0, 4)))
      .map((item) => item.id),
    rndProjectIds: rndRows.map((item) => item.id)
  });
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(buildClosingPackageHtml(bundle));
};
