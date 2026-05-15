import type { ServerResponse } from "node:http";
import type { TaxFilingBatch, TaxItem } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { readJson, writeJson } from "../../services/jsonStore.js";
import { json } from "../../utils/http.js";

const taxItemsFile = new URL("../../data/tax-items.v2.json", import.meta.url);
const taxFilingBatchesFile = new URL("../../data/tax-filing-batches.v2.json", import.meta.url);

const seedTaxItems: TaxItem[] = [];
const seedTaxFilingBatches: TaxFilingBatch[] = [];

export async function listTaxItems(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(taxItemsFile, seedTaxItems);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  const filtered = eventId ? companyRows.filter((item) => item.businessEventId === eventId) : companyRows;
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function getTaxItemDetail(req: ApiRequest, res: ServerResponse, taxItemId: string) {
  const rows = await readJson(taxItemsFile, seedTaxItems);
  const target = rows.find(
    (item) => item.id === taxItemId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Tax item not found" });
  }
  return json(res, 200, target);
}

export async function updateTaxItem(req: ApiRequest, res: ServerResponse, taxItemId: string) {
  const rows = await readJson(taxItemsFile, seedTaxItems);
  const target = rows.find(
    (item) => item.id === taxItemId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Tax item not found" });
  }
  const body = (req.body || {}) as Partial<TaxItem>;
  const next = rows.map((item) => {
    if (item.id !== taxItemId) return item;
    return {
      ...item,
      status: body.status ?? item.status,
      treatment: body.treatment ?? item.treatment,
      basis: body.basis ?? item.basis,
      filingPeriod: body.filingPeriod ?? item.filingPeriod,
      updatedAt: new Date().toISOString()
    };
  });
  const updated = next.find((item) => item.id === taxItemId)!;
  await writeJson(taxItemsFile, next);
  return json(res, 200, updated);
}

export async function listTaxFilingBatches(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(taxFilingBatchesFile, seedTaxFilingBatches);
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  return json(res, 200, { items: companyRows, total: companyRows.length });
}

export async function createTaxFilingBatch(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(taxFilingBatchesFile, seedTaxFilingBatches);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const body = (req.body || {}) as {
    taxType?: string;
    filingPeriod?: string;
    itemIds?: string[];
  };
  if (!body.taxType || !body.filingPeriod) {
    return json(res, 400, { error: "taxType and filingPeriod are required" });
  }
  const requestedIds = body.itemIds || [];
  const scopedItems = taxItems.filter(
    (item) =>
      item.companyId === req.auth!.companyId &&
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
  rows.unshift(batch);
  await writeJson(taxFilingBatchesFile, rows);
  return json(res, 201, batch);
}

export async function getTaxFilingBatchDetail(req: ApiRequest, res: ServerResponse, batchId: string) {
  const rows = await readJson(taxFilingBatchesFile, seedTaxFilingBatches);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const target = rows.find(
    (item) => item.id === batchId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  return json(res, 200, {
    ...target,
    items: taxItems.filter(
      (item) => target.itemIds.includes(item.id) && item.companyId === req.auth!.companyId
    )
  });
}

export async function validateTaxFilingBatch(req: ApiRequest, res: ServerResponse, batchId: string) {
  const rows = await readJson(taxFilingBatchesFile, seedTaxFilingBatches);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const target = rows.find(
    (item) => item.id === batchId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const items = taxItems.filter(
    (item) => target.itemIds.includes(item.id) && item.companyId === req.auth!.companyId
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
  const rows = await readJson(taxFilingBatchesFile, seedTaxFilingBatches);
  const taxItems = await readJson(taxItemsFile, seedTaxItems);
  const target = rows.find(
    (item) => item.id === batchId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Tax filing batch not found" });
  }
  const items = taxItems.filter(
    (item) => target.itemIds.includes(item.id) && item.companyId === req.auth!.companyId
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
  const next = rows.map((item) => {
    if (item.id !== batchId) return item;
    return {
      ...item,
      status: "submitted" as const,
      updatedAt
    };
  });
  const updated = next.find((item) => item.id === batchId)!;
  await writeJson(taxFilingBatchesFile, next);
  return json(res, 200, updated);
}
