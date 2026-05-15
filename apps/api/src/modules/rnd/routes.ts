import type { ServerResponse } from "node:http";
import type {
  RndAccountingPolicyReview,
  RndCostLine,
  RndPolicyGuidance,
  RndProject,
  RndProjectSummary,
  RndTimeEntry
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  normalizeRndCostLineInput,
  normalizeRndTimeEntryInput
} from "./inputs.js";
import { buildRndPolicyGuidance } from "./guidance.js";
import { buildSuperDeductionPackage } from "./package.js";
import { buildRndAccountingPolicyReview } from "./policy.js";
import { buildRndProjectSummary } from "./summary.js";

interface RndProjectRow {
  id: string;
  company_id: string;
  business_event_id: string | null;
  code: string;
  name: string;
  status: RndProject["status"];
  capitalization_policy: RndProject["capitalizationPolicy"];
  started_on: string | Date;
  ended_on: string | Date | null;
  owner_id: string | null;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RndCostLineRow {
  id: string;
  company_id: string;
  project_id: string;
  business_event_id: string | null;
  voucher_id: string | null;
  cost_type: RndCostLine["costType"];
  accounting_treatment: RndCostLine["accountingTreatment"];
  amount: string | number;
  occurred_on: string | Date;
  notes: string;
  created_at: string | Date;
}

interface RndTimeEntryRow {
  id: string;
  company_id: string;
  project_id: string;
  business_event_id: string | null;
  user_id: string | null;
  staff_name: string;
  work_date: string | Date;
  hours: string | number;
  notes: string;
  created_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAmountString(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value || 0);
  const rounded = Math.round(amount * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function mapProjectRow(row: RndProjectRow): RndProject {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    code: row.code,
    name: row.name,
    status: row.status,
    capitalizationPolicy: row.capitalization_policy,
    startedOn: (toIsoString(row.started_on) || "").slice(0, 10),
    endedOn: toIsoString(row.ended_on)?.slice(0, 10) || null,
    ownerId: row.owner_id,
    notes: row.notes,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapCostLineRow(row: RndCostLineRow): RndCostLine {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    businessEventId: row.business_event_id,
    voucherId: row.voucher_id,
    costType: row.cost_type,
    accountingTreatment: row.accounting_treatment,
    amount: toAmountString(row.amount),
    occurredOn: (toIsoString(row.occurred_on) || "").slice(0, 10),
    notes: row.notes,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

function mapTimeEntryRow(row: RndTimeEntryRow): RndTimeEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    businessEventId: row.business_event_id,
    userId: row.user_id,
    staffName: row.staff_name,
    workDate: (toIsoString(row.work_date) || "").slice(0, 10),
    hours: toAmountString(row.hours),
    notes: row.notes,
    createdAt: toIsoString(row.created_at) || new Date().toISOString()
  };
}

export async function listCompanyRndProjects(companyId: string): Promise<RndProject[]> {
  const rows = await query<RndProjectRow>(
    `
      select
        id, company_id, business_event_id, code, name, status, capitalization_policy,
        started_on, ended_on, owner_id, notes, created_at, updated_at
      from rnd_projects
      where company_id = $1
      order by created_at desc
    `,
    [companyId]
  );
  return rows.map(mapProjectRow);
}

export async function listCompanyRndCostLines(companyId: string): Promise<RndCostLine[]> {
  const rows = await query<RndCostLineRow>(
    `
      select
        id, company_id, project_id, business_event_id, voucher_id, cost_type,
        accounting_treatment, amount, occurred_on, notes, created_at
      from rnd_cost_lines
      where company_id = $1
      order by occurred_on desc, created_at desc
    `,
    [companyId]
  );
  return rows.map(mapCostLineRow);
}

export async function listCompanyRndTimeEntries(companyId: string): Promise<RndTimeEntry[]> {
  const rows = await query<RndTimeEntryRow>(
    `
      select
        id, company_id, project_id, business_event_id, user_id, staff_name,
        work_date, hours, notes, created_at
      from rnd_time_entries
      where company_id = $1
      order by work_date desc, created_at desc
    `,
    [companyId]
  );
  return rows.map(mapTimeEntryRow);
}

export async function listRndProjects(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const [projects, costLines, timeEntries] = await Promise.all([
    listCompanyRndProjects(companyId),
    listCompanyRndCostLines(companyId),
    listCompanyRndTimeEntries(companyId)
  ]);
  const items = projects.map((project) => ({
    ...project,
    summary: buildRndProjectSummary(project, costLines, timeEntries)
  }));
  return json(res, 200, { items, total: items.length });
}

export async function createRndProject(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const now = new Date().toISOString();
  const id = `rnd-${Date.now()}`;
  const input = (req.body ?? {}) as {
    businessEventId?: string | null;
    code?: string;
    name?: string;
    status?: RndProject["status"];
    capitalizationPolicy?: RndProject["capitalizationPolicy"];
    startedOn?: string;
    endedOn?: string | null;
    notes?: string;
  };
  const project = await withTransaction(async (client) => {
    await client.query(
      `
        insert into rnd_projects (
          id, company_id, business_event_id, code, name, status, capitalization_policy,
          started_on, ended_on, owner_id, notes, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        id,
        companyId,
        input.businessEventId ?? null,
        input.code || `RND-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-4)}`,
        input.name || "未命名研发项目",
        input.status || "planning",
        input.capitalizationPolicy || "mixed",
        input.startedOn || now.slice(0, 10),
        input.endedOn || null,
        req.auth?.userId ?? null,
        input.notes || "",
        now,
        now
      ]
    );
    const row = await client.query<RndProjectRow>(
      `
        select
          id, company_id, business_event_id, code, name, status, capitalization_policy,
          started_on, ended_on, owner_id, notes, created_at, updated_at
        from rnd_projects
        where id = $1
      `,
      [id]
    );
    return mapProjectRow(row.rows[0]!);
  });
  return json(res, 201, project);
}

export async function getRndProjectDetail(req: ApiRequest, res: ServerResponse, projectId: string) {
  const companyId = req.auth!.companyId;
  const projectRow = await queryOne<RndProjectRow>(
    `
      select
        id, company_id, business_event_id, code, name, status, capitalization_policy,
        started_on, ended_on, owner_id, notes, created_at, updated_at
      from rnd_projects
      where company_id = $1 and id = $2
    `,
    [companyId, projectId]
  );
  if (!projectRow) {
    return json(res, 404, { error: "R&D project not found" });
  }
  const [costLines, timeEntries] = await Promise.all([
    listCompanyRndCostLines(companyId),
    listCompanyRndTimeEntries(companyId)
  ]);
  const project = mapProjectRow(projectRow);
  const projectCostLines = costLines.filter((item) => item.projectId === projectId);
  const projectTimeEntries = timeEntries.filter((item) => item.projectId === projectId);
  const summary: RndProjectSummary = buildRndProjectSummary(project, projectCostLines, projectTimeEntries);
  const policyReview: RndAccountingPolicyReview = buildRndAccountingPolicyReview(
    project,
    projectCostLines,
    projectTimeEntries
  );
  const guidance: RndPolicyGuidance = buildRndPolicyGuidance(
    project,
    policyReview,
    summary.superDeductionEligibleBase
  );

  return json(res, 200, {
    ...project,
    costLines: projectCostLines,
    timeEntries: projectTimeEntries,
    summary,
    policyReview,
    guidance
  });
}

export async function getRndSuperDeductionPackage(req: ApiRequest, res: ServerResponse, projectId: string) {
  const companyId = req.auth!.companyId;
  const projectRow = await ensureProject(companyId, projectId);
  if (!projectRow) {
    return json(res, 404, { error: "R&D project not found" });
  }
  const [costLines, timeEntries] = await Promise.all([
    listCompanyRndCostLines(companyId),
    listCompanyRndTimeEntries(companyId)
  ]);
  const project = mapProjectRow(projectRow);
  const pkg = buildSuperDeductionPackage(
    project,
    costLines.filter((item) => item.projectId === projectId),
    timeEntries.filter((item) => item.projectId === projectId),
    new Date().toISOString()
  );
  return json(res, 200, pkg);
}

async function ensureProject(companyId: string, projectId: string): Promise<RndProjectRow | null> {
  return queryOne<RndProjectRow>(
    `
      select
        id, company_id, business_event_id, code, name, status, capitalization_policy,
        started_on, ended_on, owner_id, notes, created_at, updated_at
      from rnd_projects
      where company_id = $1 and id = $2
    `,
    [companyId, projectId]
  );
}

export async function createRndCostLine(req: ApiRequest, res: ServerResponse, projectId: string) {
  const companyId = req.auth!.companyId;
  const project = await ensureProject(companyId, projectId);
  if (!project) {
    return json(res, 404, { error: "R&D project not found" });
  }

  try {
    const input = normalizeRndCostLineInput(req.body as Record<string, unknown>);
    const id = `rnd-cost-${Date.now()}`;
    const created = await withTransaction(async (client) => {
      await client.query(
        `
          insert into rnd_cost_lines (
            id, company_id, project_id, business_event_id, voucher_id, cost_type,
            accounting_treatment, amount, occurred_on, notes, created_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          id,
          companyId,
          projectId,
          input.businessEventId,
          input.voucherId,
          input.costType,
          input.accountingTreatment,
          input.amount,
          input.occurredOn,
          input.notes,
          new Date().toISOString()
        ]
      );
      const row = await client.query<RndCostLineRow>(
        `
          select
            id, company_id, project_id, business_event_id, voucher_id, cost_type,
            accounting_treatment, amount, occurred_on, notes, created_at
          from rnd_cost_lines
          where id = $1
        `,
        [id]
      );
      return mapCostLineRow(row.rows[0]!);
    });
    return json(res, 201, created);
  } catch (error) {
    return json(res, 400, { error: (error as Error).message });
  }
}

export async function createRndTimeEntry(req: ApiRequest, res: ServerResponse, projectId: string) {
  const companyId = req.auth!.companyId;
  const project = await ensureProject(companyId, projectId);
  if (!project) {
    return json(res, 404, { error: "R&D project not found" });
  }

  try {
    const input = normalizeRndTimeEntryInput(req.body as Record<string, unknown>);
    const id = `rnd-time-${Date.now()}`;
    const created = await withTransaction(async (client) => {
      await client.query(
        `
          insert into rnd_time_entries (
            id, company_id, project_id, business_event_id, user_id, staff_name,
            work_date, hours, notes, created_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          id,
          companyId,
          projectId,
          input.businessEventId,
          input.userId,
          input.staffName,
          input.workDate,
          input.hours,
          input.notes,
          new Date().toISOString()
        ]
      );
      const row = await client.query<RndTimeEntryRow>(
        `
          select
            id, company_id, project_id, business_event_id, user_id, staff_name,
            work_date, hours, notes, created_at
          from rnd_time_entries
          where id = $1
        `,
        [id]
      );
      return mapTimeEntryRow(row.rows[0]!);
    });
    return json(res, 201, created);
  } catch (error) {
    return json(res, 400, { error: (error as Error).message });
  }
}

export async function getRndTrend(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url!, "http://x");
  const months = Math.min(parseInt(url.searchParams.get("months") ?? "12", 10), 24);

  const rows = await query<{
    month: string;
    cost_type: string;
    accounting_treatment: string;
    total: string;
  }>(
    `
      select
        to_char(occurred_on, 'YYYY-MM') as month,
        cost_type,
        accounting_treatment,
        sum(amount)::text as total
      from rnd_cost_lines
      where company_id = $1
        and occurred_on >= (current_date - make_interval(months => $2))
      group by 1, 2, 3
      order by 1 desc, 2, 3
    `,
    [companyId, months]
  );

  const monthMap: Record<string, { month: string; expensed: number; capitalized: number; total: number }> = {};
  for (const row of rows) {
    if (!monthMap[row.month]) {
      monthMap[row.month] = { month: row.month, expensed: 0, capitalized: 0, total: 0 };
    }
    const amount = Number(row.total);
    monthMap[row.month].total += amount;
    if (row.accounting_treatment === "capitalized") {
      monthMap[row.month].capitalized += amount;
    } else {
      monthMap[row.month].expensed += amount;
    }
  }

  const trend = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));

  return json(res, 200, {
    trend,
    months,
    detail: rows.map((r) => ({
      month: r.month,
      costType: r.cost_type,
      accountingTreatment: r.accounting_treatment,
      total: Number(r.total)
    }))
  });
}
