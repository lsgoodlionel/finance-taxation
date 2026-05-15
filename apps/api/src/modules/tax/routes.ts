import type { ServerResponse } from "node:http";
import type {
  CorporateIncomeTaxPreparation,
  IndividualIncomeTaxMaterial,
  LedgerEntry,
  StampAndSurtaxSummary,
  TaxFilingBatch,
  TaxFilingBatchArchiveRecord,
  TaxFilingBatchReviewRecord,
  TaxItem,
  TaxRuleProfile,
  TaxpayerProfile,
  VatWorkingPaper
} from "@finance-taxation/domain-model";
import { query, queryOne, withTransaction } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { listCompanyRndCostLines, listCompanyRndProjects, listCompanyRndTimeEntries } from "../rnd/routes.js";
import { buildRndProjectSummary } from "../rnd/summary.js";
import { listCompanyLedgerEntries } from "../vouchers/routes.js";
import { buildProfitStatementReport } from "../reports/summary.js";
import { buildCorporateIncomeTaxPreparation } from "./corporate-income-tax.js";
import { buildArchiveRecord, buildReviewRecord, canArchiveBatch } from "./filing-workflow.js";
import { buildIndividualIncomeTaxMaterials } from "./iit-materials.js";
import { buildTaxWorkingPaperPrintableHtml } from "./printable.js";
import { resolveActiveTaxpayerProfile } from "./profile.js";
import { resolveFilingPeriod, resolveTaxRuleProfile } from "./rules.js";
import { buildStampAndSurtaxSummary } from "./stamp-surtax.js";
import { buildVatWorkingPaper } from "./vat-working-paper.js";

interface TaxItemRow {
  id: string;
  company_id: string;
  business_event_id: string;
  mapping_id: string;
  tax_type: string;
  treatment: string;
  basis: string;
  filing_period: string;
  status: TaxItem["status"];
  source: TaxItem["source"];
  created_at: string | Date;
  updated_at: string | Date;
}

interface TaxFilingBatchRow {
  id: string;
  company_id: string;
  tax_type: string;
  filing_period: string;
  status: TaxFilingBatch["status"];
  created_at: string | Date;
  updated_at: string | Date;
}

interface TaxpayerProfileRow {
  id: string;
  company_id: string;
  taxpayer_type: TaxpayerProfile["taxpayerType"];
  effective_from: string | Date;
  status: TaxpayerProfile["status"];
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TaxFilingBatchReviewRow {
  id: string;
  company_id: string;
  batch_id: string;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string;
  review_result: TaxFilingBatchReviewRecord["reviewResult"];
  review_notes: string;
  reviewed_at: string | Date;
}

interface TaxFilingBatchArchiveRow {
  id: string;
  company_id: string;
  batch_id: string;
  archived_by_user_id: string | null;
  archived_by_name: string;
  archive_label: string;
  archive_notes: string;
  archived_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapTaxItemRow(row: TaxItemRow): TaxItem {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    mappingId: row.mapping_id,
    taxType: row.tax_type,
    treatment: row.treatment,
    basis: row.basis,
    filingPeriod: row.filing_period,
    status: row.status,
    source: row.source,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapTaxFilingBatchRow(row: TaxFilingBatchRow, itemIds: string[]): TaxFilingBatch {
  return {
    id: row.id,
    companyId: row.company_id,
    taxType: row.tax_type,
    filingPeriod: row.filing_period,
    status: row.status,
    itemIds,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapTaxpayerProfileRow(row: TaxpayerProfileRow): TaxpayerProfile {
  return {
    id: row.id,
    companyId: row.company_id,
    taxpayerType: row.taxpayer_type,
    effectiveFrom: (toIsoString(row.effective_from) || "").slice(0, 10),
    status: row.status,
    notes: row.notes,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapTaxFilingBatchReviewRow(row: TaxFilingBatchReviewRow): TaxFilingBatchReviewRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    batchId: row.batch_id,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedByName: row.reviewed_by_name,
    reviewResult: row.review_result,
    reviewNotes: row.review_notes,
    reviewedAt: toIsoString(row.reviewed_at) || new Date().toISOString()
  };
}

function mapTaxFilingBatchArchiveRow(row: TaxFilingBatchArchiveRow): TaxFilingBatchArchiveRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    batchId: row.batch_id,
    archivedByUserId: row.archived_by_user_id,
    archivedByName: row.archived_by_name,
    archiveLabel: row.archive_label,
    archiveNotes: row.archive_notes,
    archivedAt: toIsoString(row.archived_at) || new Date().toISOString()
  };
}

export async function listCompanyTaxItems(
  companyId: string,
  options: { businessEventId?: string; taxItemId?: string } = {}
): Promise<TaxItem[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  if (options.taxItemId) {
    params.push(options.taxItemId);
    where += ` and id = $${params.length}`;
  }
  const rows = await query<TaxItemRow>(
    `
      select
        id, company_id, business_event_id, mapping_id, tax_type, treatment, basis,
        filing_period, status, source, created_at, updated_at
      from tax_items
      ${where}
      order by created_at desc
    `,
    params
  );
  return rows.map(mapTaxItemRow);
}

export async function listCompanyTaxFilingBatches(
  companyId: string,
  batchId?: string
): Promise<TaxFilingBatch[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (batchId) {
    params.push(batchId);
    where += ` and id = $${params.length}`;
  }
  const batchRows = await query<TaxFilingBatchRow>(
    `
      select
        id, company_id, tax_type, filing_period, status, created_at, updated_at
      from tax_filing_batches
      ${where}
      order by created_at desc
    `,
    params
  );
  if (!batchRows.length) {
    return [];
  }
  const batchIds = batchRows.map((row) => row.id);
  const links = await query<{ batch_id: string; tax_item_id: string }>(
    `
      select batch_id, tax_item_id
      from tax_filing_batch_items
      where batch_id = any($1::text[])
    `,
    [batchIds]
  );
  return batchRows.map((row) =>
    mapTaxFilingBatchRow(
      row,
      links.filter((item) => item.batch_id === row.id).map((item) => item.tax_item_id)
    )
  );
}

export async function listCompanyTaxpayerProfiles(companyId: string): Promise<TaxpayerProfile[]> {
  const rows = await query<TaxpayerProfileRow>(
    `
      select
        id, company_id, taxpayer_type, effective_from, status, notes, created_at, updated_at
      from taxpayer_profiles
      where company_id = $1
      order by effective_from desc, created_at desc
    `,
    [companyId]
  );
  return rows.map(mapTaxpayerProfileRow);
}

export async function listCompanyTaxFilingBatchReviews(companyId: string, batchId: string) {
  const rows = await query<TaxFilingBatchReviewRow>(
    `
      select
        id, company_id, batch_id, reviewed_by_user_id, reviewed_by_name,
        review_result, review_notes, reviewed_at
      from tax_filing_batch_reviews
      where company_id = $1 and batch_id = $2
      order by reviewed_at desc
    `,
    [companyId, batchId]
  );
  return rows.map(mapTaxFilingBatchReviewRow);
}

export async function listCompanyTaxFilingBatchArchives(companyId: string, batchId: string) {
  const rows = await query<TaxFilingBatchArchiveRow>(
    `
      select
        id, company_id, batch_id, archived_by_user_id, archived_by_name,
        archive_label, archive_notes, archived_at
      from tax_filing_batch_archives
      where company_id = $1 and batch_id = $2
      order by archived_at desc
    `,
    [companyId, batchId]
  );
  return rows.map(mapTaxFilingBatchArchiveRow);
}

function resolveAnchorDateFromFilingPeriod(filingPeriod: string): string {
  if (/^\d{4}-Q[1-4]$/.test(filingPeriod)) {
    const year = filingPeriod.slice(0, 4);
    const quarter = Number(filingPeriod.slice(-1));
    const month = quarter * 3;
    return `${year}-${String(month).padStart(2, "0")}-28`;
  }
  if (/^\d{4}$/.test(filingPeriod)) {
    return `${filingPeriod}-12-31`;
  }
  return `${filingPeriod}-28`;
}

function filterEntriesByFilingPeriod(entries: LedgerEntry[], filingPeriod: string): LedgerEntry[] {
  if (/^\d{4}-Q[1-4]$/.test(filingPeriod)) {
    const year = filingPeriod.slice(0, 4);
    const quarter = Number(filingPeriod.slice(-1));
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(Number(year), endMonth, 0)).toISOString().slice(0, 10);
    return entries.filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate);
  }
  if (/^\d{4}-\d{2}$/.test(filingPeriod)) {
    const startDate = `${filingPeriod}-01`;
    const year = Number(filingPeriod.slice(0, 4));
    const month = Number(filingPeriod.slice(5, 7));
    const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return entries.filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate);
  }
  if (/^\d{4}$/.test(filingPeriod)) {
    const startDate = `${filingPeriod}-01-01`;
    const endDate = `${filingPeriod}-12-31`;
    return entries.filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate);
  }
  return entries;
}

export async function listTaxItems(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyTaxItems(req.auth!.companyId, { businessEventId: eventId });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function getTaxItemDetail(req: ApiRequest, res: ServerResponse, taxItemId: string) {
  const rows = await listCompanyTaxItems(req.auth!.companyId, { taxItemId });
  const target = rows[0];
  if (!target) {
    return json(res, 404, { error: "Tax item not found" });
  }
  return json(res, 200, target);
}

export async function updateTaxItem(req: ApiRequest, res: ServerResponse, taxItemId: string) {
  const rows = await listCompanyTaxItems(req.auth!.companyId, { taxItemId });
  const target = rows[0];
  if (!target) {
    return json(res, 404, { error: "Tax item not found" });
  }
  const body = (req.body || {}) as Partial<TaxItem>;
  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update tax_items
      set
        status = $1,
        treatment = $2,
        basis = $3,
        filing_period = $4,
        updated_at = $5::timestamptz
      where id = $6 and company_id = $7
      returning id
    `,
    [
      body.status ?? target.status,
      body.treatment ?? target.treatment,
      body.basis ?? target.basis,
      body.filingPeriod ?? target.filingPeriod,
      updatedAt,
      taxItemId,
      req.auth!.companyId
    ]
  );
  const updated = (await listCompanyTaxItems(req.auth!.companyId, { taxItemId }))[0];
  return json(res, 200, updated);
}

export async function listTaxFilingBatches(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyTaxFilingBatches(req.auth!.companyId);
  return json(res, 200, { items: rows, total: rows.length });
}

export async function createTaxFilingBatch(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as {
    taxType?: string;
    filingPeriod?: string;
    itemIds?: string[];
  };
  if (!body.taxType || !body.filingPeriod) {
    return json(res, 400, { error: "taxType and filingPeriod are required" });
  }
  const requestedIds = body.itemIds || [];
  const allItems = await listCompanyTaxItems(req.auth!.companyId);
  const scopedItems = allItems.filter(
    (item) =>
      item.taxType === body.taxType &&
      item.filingPeriod === body.filingPeriod &&
      (requestedIds.length === 0 || requestedIds.includes(item.id))
  );
  const now = new Date().toISOString();
  const batch: TaxFilingBatch = {
    id: `tax-batch-${Date.now()}`,
    companyId: req.auth!.companyId,
    taxType: body.taxType,
    filingPeriod: body.filingPeriod,
    status: scopedItems.every((item) => item.status === "ready") ? "ready" : "review_required",
    itemIds: scopedItems.map((item) => item.id),
    createdAt: now,
    updatedAt: now
  };
  await withTransaction(async (client) => {
    await client.query(
      `
        insert into tax_filing_batches (
          id, company_id, tax_type, filing_period, status, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
      `,
      [
        batch.id,
        batch.companyId,
        batch.taxType,
        batch.filingPeriod,
        batch.status,
        batch.createdAt,
        batch.updatedAt
      ]
    );
    for (const itemId of batch.itemIds) {
      await client.query(
        `
          insert into tax_filing_batch_items (batch_id, tax_item_id)
          values ($1, $2)
        `,
        [batch.id, itemId]
      );
    }
  });
  return json(res, 201, batch);
}

export async function getTaxFilingBatchDetail(req: ApiRequest, res: ServerResponse, batchId: string) {
  const batches = await listCompanyTaxFilingBatches(req.auth!.companyId, batchId);
  const target = batches[0];
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const [items, reviews, archives] = await Promise.all([
    listCompanyTaxItems(req.auth!.companyId),
    listCompanyTaxFilingBatchReviews(req.auth!.companyId, batchId),
    listCompanyTaxFilingBatchArchives(req.auth!.companyId, batchId)
  ]);
  return json(res, 200, {
    ...target,
    items: items.filter((item) => target.itemIds.includes(item.id)),
    reviews,
    archives
  });
}

export async function validateTaxFilingBatch(req: ApiRequest, res: ServerResponse, batchId: string) {
  const batches = await listCompanyTaxFilingBatches(req.auth!.companyId, batchId);
  const target = batches[0];
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const items = (await listCompanyTaxItems(req.auth!.companyId)).filter((item) =>
    target.itemIds.includes(item.id)
  );
  const issues: string[] = [];
  if (!items.length) {
    issues.push("批次内没有税务事项");
  }
  if (items.some((item) => item.taxType !== target.taxType)) {
    issues.push("批次中存在不同税种事项");
  }
  if (items.some((item) => item.filingPeriod !== target.filingPeriod)) {
    issues.push("批次中存在不同申报期事项");
  }
  if (items.some((item) => item.status !== "ready")) {
    issues.push("批次中存在未 ready 的税务事项");
  }
  return json(res, 200, {
    id: target.id,
    valid: issues.length === 0,
    issues,
    itemCount: items.length
  });
}

export async function submitTaxFilingBatch(req: ApiRequest, res: ServerResponse, batchId: string) {
  const batches = await listCompanyTaxFilingBatches(req.auth!.companyId, batchId);
  const target = batches[0];
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const items = (await listCompanyTaxItems(req.auth!.companyId)).filter((item) =>
    target.itemIds.includes(item.id)
  );
  if (
    !items.length ||
    items.some((item) => item.taxType !== target.taxType) ||
    items.some((item) => item.filingPeriod !== target.filingPeriod) ||
    items.some((item) => item.status !== "ready")
  ) {
    return json(res, 400, { error: "Tax filing batch is not ready for submit" });
  }
  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update tax_filing_batches
      set
        status = 'submitted',
        updated_at = $1::timestamptz
      where id = $2 and company_id = $3
      returning id
    `,
    [updatedAt, batchId, req.auth!.companyId]
  );
  const updated = (await listCompanyTaxFilingBatches(req.auth!.companyId, batchId))[0];
  return json(res, 200, updated);
}

export async function reviewTaxFilingBatch(req: ApiRequest, res: ServerResponse, batchId: string) {
  const batches = await listCompanyTaxFilingBatches(req.auth!.companyId, batchId);
  const target = batches[0];
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const body = (req.body || {}) as { reviewResult?: "approved" | "rejected"; reviewNotes?: string };
  const result = body.reviewResult || "approved";
  const review = buildReviewRecord(
    target,
    {
      userId: req.auth?.userId || null,
      userName: req.auth?.username || "system",
      result,
      notes: body.reviewNotes || ""
    },
    new Date().toISOString()
  );
  const nextStatus = result === "approved" ? "ready" : "review_required";
  await withTransaction(async (client) => {
    await client.query(
      `
        insert into tax_filing_batch_reviews (
          id, company_id, batch_id, reviewed_by_user_id, reviewed_by_name,
          review_result, review_notes, reviewed_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)
      `,
      [
        review.id,
        review.companyId,
        review.batchId,
        review.reviewedByUserId,
        review.reviewedByName,
        review.reviewResult,
        review.reviewNotes,
        review.reviewedAt
      ]
    );
    await client.query(
      `
        update tax_filing_batches
        set status = $1, updated_at = $2::timestamptz
        where id = $3 and company_id = $4
      `,
      [nextStatus, review.reviewedAt, batchId, req.auth!.companyId]
    );
  });
  return getTaxFilingBatchDetail(req, res, batchId);
}

export async function archiveTaxFilingBatch(req: ApiRequest, res: ServerResponse, batchId: string) {
  const batches = await listCompanyTaxFilingBatches(req.auth!.companyId, batchId);
  const target = batches[0];
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  if (!canArchiveBatch(target.status)) {
    return json(res, 400, { error: "Only submitted batches can be archived" });
  }
  const body = (req.body || {}) as { archiveLabel?: string; archiveNotes?: string };
  const archive = buildArchiveRecord(
    target,
    {
      userId: req.auth?.userId || null,
      userName: req.auth?.username || "system",
      label: body.archiveLabel || `${target.taxType}-${target.filingPeriod}`,
      notes: body.archiveNotes || ""
    },
    new Date().toISOString()
  );
  await withTransaction(async (client) => {
    await client.query(
      `
        insert into tax_filing_batch_archives (
          id, company_id, batch_id, archived_by_user_id, archived_by_name,
          archive_label, archive_notes, archived_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)
      `,
      [
        archive.id,
        archive.companyId,
        archive.batchId,
        archive.archivedByUserId,
        archive.archivedByName,
        archive.archiveLabel,
        archive.archiveNotes,
        archive.archivedAt
      ]
    );
    await client.query(
      `
        update tax_filing_batches
        set status = 'archived', updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [archive.archivedAt, batchId, req.auth!.companyId]
    );
  });
  return getTaxFilingBatchDetail(req, res, batchId);
}

export async function listTaxpayerProfiles(req: ApiRequest, res: ServerResponse) {
  const items = await listCompanyTaxpayerProfiles(req.auth!.companyId);
  return json(res, 200, { items, total: items.length });
}

export async function createTaxpayerProfile(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as Partial<TaxpayerProfile>;
  if (!body.taxpayerType || !body.effectiveFrom) {
    return json(res, 400, { error: "taxpayerType and effectiveFrom are required" });
  }
  const now = new Date().toISOString();
  const profile: TaxpayerProfile = {
    id: `taxpayer-${Date.now()}`,
    companyId: req.auth!.companyId,
    taxpayerType: body.taxpayerType,
    effectiveFrom: body.effectiveFrom,
    status: body.status || "active",
    notes: body.notes || "",
    createdAt: now,
    updatedAt: now
  };
  await withTransaction(async (client) => {
    if (profile.status === "active") {
      await client.query(
        `
          update taxpayer_profiles
          set status = 'inactive', updated_at = $1::timestamptz
          where company_id = $2 and status = 'active'
        `,
        [profile.updatedAt, profile.companyId]
      );
    }
    await client.query(
      `
        insert into taxpayer_profiles (
          id, company_id, taxpayer_type, effective_from, status, notes, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
      `,
      [
        profile.id,
        profile.companyId,
        profile.taxpayerType,
        profile.effectiveFrom,
        profile.status,
        profile.notes,
        profile.createdAt,
        profile.updatedAt
      ]
    );
  });
  return json(res, 201, profile);
}

export async function getTaxRuleProfile(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const taxType = url.searchParams.get("taxType");
  const occurredOn = url.searchParams.get("occurredOn");
  if (!taxType || !occurredOn) {
    return json(res, 400, { error: "taxType and occurredOn are required" });
  }
  const profiles = await listCompanyTaxpayerProfiles(req.auth!.companyId);
  const profile = resolveActiveTaxpayerProfile(profiles, occurredOn);
  if (!profile) {
    return json(res, 404, { error: "Active taxpayer profile not found" });
  }
  const rule: TaxRuleProfile = resolveTaxRuleProfile(profile, taxType);
  return json(res, 200, {
    ...rule,
    filingPeriod: resolveFilingPeriod(occurredOn, profile, taxType)
  });
}

export async function getIndividualIncomeTaxMaterials(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filingPeriod = url.searchParams.get("filingPeriod");
  if (!filingPeriod) {
    return json(res, 400, { error: "filingPeriod is required" });
  }
  const [taxItems, ledgerEntries] = await Promise.all([
    listCompanyTaxItems(req.auth!.companyId),
    listCompanyLedgerEntries(req.auth!.companyId)
  ]);
  const payload: IndividualIncomeTaxMaterial = buildIndividualIncomeTaxMaterials(
    req.auth!.companyId,
    filingPeriod,
    taxItems,
    ledgerEntries
  );
  return json(res, 200, payload);
}

export async function getStampAndSurtaxSummary(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filingPeriod = url.searchParams.get("filingPeriod");
  if (!filingPeriod) {
    return json(res, 400, { error: "filingPeriod is required" });
  }
  const taxItems = await listCompanyTaxItems(req.auth!.companyId);
  const payload: StampAndSurtaxSummary = buildStampAndSurtaxSummary(req.auth!.companyId, filingPeriod, taxItems);
  return json(res, 200, payload);
}

export async function getVatWorkingPaper(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filingPeriod = url.searchParams.get("filingPeriod");
  if (!filingPeriod) {
    return json(res, 400, { error: "filingPeriod is required" });
  }
  const [items, profiles] = await Promise.all([
    listCompanyTaxItems(req.auth!.companyId),
    listCompanyTaxpayerProfiles(req.auth!.companyId)
  ]);
  const profile = resolveActiveTaxpayerProfile(profiles, resolveAnchorDateFromFilingPeriod(filingPeriod));
  if (!profile) {
    return json(res, 404, { error: "Active taxpayer profile not found" });
  }
  const paper: VatWorkingPaper = buildVatWorkingPaper(profile, items, filingPeriod);
  return json(res, 200, paper);
}

export async function getCorporateIncomeTaxPreparation(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const filingPeriod = url.searchParams.get("filingPeriod");
  if (!filingPeriod) {
    return json(res, 400, { error: "filingPeriod is required" });
  }
  const companyId = req.auth!.companyId;
  const [entries, taxItems, projects, costLines, timeEntries] = await Promise.all([
    listCompanyLedgerEntries(companyId),
    listCompanyTaxItems(companyId),
    listCompanyRndProjects(companyId),
    listCompanyRndCostLines(companyId),
    listCompanyRndTimeEntries(companyId)
  ]);

  const periodEntries = filterEntriesByFilingPeriod(entries, filingPeriod);

  const profitStatement = buildProfitStatementReport({
    periodLabel: filingPeriod,
    entries: periodEntries
  });
  const rndSummaries = projects.map((project) => buildRndProjectSummary(
    project,
    costLines.filter((item) => item.projectId === project.id),
    timeEntries.filter((item) => item.projectId === project.id)
  ));
  const preparation: CorporateIncomeTaxPreparation = buildCorporateIncomeTaxPreparation({
    companyId,
    filingPeriod,
    profitStatement,
    taxItems: taxItems.filter((item) => item.filingPeriod === filingPeriod || item.taxType.includes("企业所得税")),
    rndSummaries
  });
  return json(res, 200, preparation);
}

export async function getTaxWorkingPaperPrintable(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const kind = url.searchParams.get("kind") || "vat";
  const filingPeriod = url.searchParams.get("filingPeriod");
  if (!filingPeriod) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("filingPeriod is required");
    return;
  }

  if (kind === "corporate_income_tax") {
    const companyId = req.auth!.companyId;
    const [entries, taxItems, projects, costLines, timeEntries] = await Promise.all([
      listCompanyLedgerEntries(companyId),
      listCompanyTaxItems(companyId),
      listCompanyRndProjects(companyId),
      listCompanyRndCostLines(companyId),
      listCompanyRndTimeEntries(companyId)
    ]);
    const profitStatement = buildProfitStatementReport({
      periodLabel: filingPeriod,
      entries: filterEntriesByFilingPeriod(entries, filingPeriod)
    });
    const rndSummaries = projects.map((project) => buildRndProjectSummary(
      project,
      costLines.filter((item) => item.projectId === project.id),
      timeEntries.filter((item) => item.projectId === project.id)
    ));
    const payload = buildCorporateIncomeTaxPreparation({
      companyId,
      filingPeriod,
      profitStatement,
      taxItems,
      rndSummaries
    });
    const html = buildTaxWorkingPaperPrintableHtml("企业所得税预缴与汇算准备", payload);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
    return;
  }

  const [items, profiles] = await Promise.all([
    listCompanyTaxItems(req.auth!.companyId),
    listCompanyTaxpayerProfiles(req.auth!.companyId)
  ]);
  const profile = resolveActiveTaxpayerProfile(profiles, resolveAnchorDateFromFilingPeriod(filingPeriod));
  if (!profile) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Active taxpayer profile not found");
    return;
  }
  const paper = buildVatWorkingPaper(profile, items, filingPeriod);
  const html = buildTaxWorkingPaperPrintableHtml("增值税底稿", paper);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}
