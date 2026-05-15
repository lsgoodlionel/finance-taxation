import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import type { RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { listCompanyDocuments } from "../documents/routes.js";
import { getEventDetail, listCompanyEvents, listCompanyTasks } from "../events/routes.js";
import { listCompanyRndProjects } from "../rnd/routes.js";
import { listCompanyTaxFilingBatches, listCompanyTaxItems } from "../tax/routes.js";
import { listCompanyLedgerEntries, listCompanyVouchers } from "../vouchers/routes.js";
import { evaluateRiskFindings } from "./engine.js";
import { scoreRiskFindings } from "./scoring.js";

interface RiskFindingRow {
  id: string;
  company_id: string;
  business_event_id: string | null;
  rule_code: string;
  severity: RiskFinding["severity"];
  status: RiskFinding["status"];
  title: string;
  detail: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RiskClosureRecordRow {
  id: string;
  company_id: string;
  finding_id: string;
  closed_by_user_id: string | null;
  closed_by_name: string;
  resolution: string;
  reviewed_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRiskFindingRow(row: RiskFindingRow): RiskFinding {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    ruleCode: row.rule_code,
    severity: row.severity,
    status: row.status,
    title: row.title,
    detail: row.detail,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapRiskClosureRecordRow(row: RiskClosureRecordRow): RiskClosureRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    findingId: row.finding_id,
    closedByUserId: row.closed_by_user_id,
    closedByName: row.closed_by_name,
    resolution: row.resolution,
    reviewedAt: toIsoString(row.reviewed_at) || new Date().toISOString()
  };
}

export async function listCompanyRiskFindings(companyId: string): Promise<RiskFinding[]> {
  const rows = await query<RiskFindingRow>(
    `
      select
        id, company_id, business_event_id, rule_code, severity, status,
        title, detail, created_at, updated_at
      from risk_findings
      where company_id = $1
      order by created_at desc
    `,
    [companyId]
  );
  return rows.map(mapRiskFindingRow);
}

export async function listRiskFindings(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const findings = scoreRiskFindings(await listCompanyRiskFindings(companyId));
  return json(res, 200, { items: findings, total: findings.length });
}

export async function runEventRiskCheck(req: ApiRequest, res: ServerResponse, eventId: string) {
  const companyId = req.auth!.companyId;
  const [events, tasks, taxItems, taxFilingBatches, generatedDocuments, vouchers, ledgerEntries, rndProjects] =
    await Promise.all([
      listCompanyEvents(companyId),
      listCompanyTasks(companyId),
      listCompanyTaxItems(companyId),
      listCompanyTaxFilingBatches(companyId),
      listCompanyDocuments(companyId),
      listCompanyVouchers(companyId),
      listCompanyLedgerEntries(companyId),
      listCompanyRndProjects(companyId)
    ]);

  const event = events.find((item) => item.id === eventId);
  if (!event) {
    return json(res, 404, { error: "Business event not found" });
  }

  const findings = scoreRiskFindings(evaluateRiskFindings({
    now: new Date().toISOString(),
    event,
    events,
    tasks,
    taxItems,
    taxFilingBatches,
    generatedDocuments: generatedDocuments.filter((item) => item.businessEventId === eventId),
    generatedDocumentsAll: generatedDocuments,
    vouchers,
    ledgerEntries,
    rndProjects
  }));

  await withTransaction(async (client) => {
    await client.query("delete from risk_findings where company_id = $1 and business_event_id = $2", [
      companyId,
      eventId
    ]);
    for (const finding of findings) {
      await client.query(
        `
          insert into risk_findings (
            id, company_id, business_event_id, rule_code, severity, status,
            title, detail, created_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          finding.id,
          finding.companyId,
          finding.businessEventId,
          finding.ruleCode,
          finding.severity,
          finding.status,
          finding.title,
          finding.detail,
          finding.createdAt,
          finding.updatedAt
        ]
      );
    }
  });

  return json(res, 200, { items: findings, total: findings.length });
}

export async function listRiskClosureRecords(req: ApiRequest, res: ServerResponse, findingId: string) {
  const rows = await query<RiskClosureRecordRow>(
    `
      select
        id, company_id, finding_id, closed_by_user_id, closed_by_name, resolution, reviewed_at
      from risk_closure_records
      where company_id = $1 and finding_id = $2
      order by reviewed_at desc
    `,
    [req.auth!.companyId, findingId]
  );
  return json(res, 200, { items: rows.map(mapRiskClosureRecordRow), total: rows.length });
}

export async function closeRiskFinding(req: ApiRequest, res: ServerResponse, findingId: string) {
  const companyId = req.auth!.companyId;
  const finding = await queryOne<RiskFindingRow>(
    `
      select
        id, company_id, business_event_id, rule_code, severity, status, title, detail, created_at, updated_at
      from risk_findings
      where company_id = $1 and id = $2
    `,
    [companyId, findingId]
  );
  if (!finding) {
    return json(res, 404, { error: "Risk finding not found" });
  }
  const resolution = String((req.body as { resolution?: string } | undefined)?.resolution || "").trim();
  if (!resolution) {
    return json(res, 400, { error: "resolution is required" });
  }
  const now = new Date().toISOString();
  const closureId = `risk-close-${Date.now()}`;
  await withTransaction(async (client) => {
    await client.query(
      `
        update risk_findings
        set status = 'resolved', updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [now, findingId, companyId]
    );
    await client.query(
      `
        insert into risk_closure_records (
          id, company_id, finding_id, closed_by_user_id, closed_by_name, resolution, reviewed_at
        )
        values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
      `,
      [closureId, companyId, findingId, req.auth?.userId || null, req.auth?.username || "系统用户", resolution, now]
    );
  });
  const updated = scoreRiskFindings(await listCompanyRiskFindings(companyId));
  return json(res, 200, updated.find((item) => item.id === findingId));
}
