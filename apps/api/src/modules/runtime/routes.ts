import type { ServerResponse } from "node:http";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { hasCompanyWideAccess, listCompanyEvents, listCompanyTasks } from "../events/routes.js";
import { listCompanyPayrollRecords, listCompanyPayrollReviewLedgers } from "../payroll/routes.js";
import { getBatchWithLines, listBatches } from "../payroll/transfer.js";
import { listCompanyRiskFindings } from "../risk/routes.js";
import {
  listCompanyTaxFilingBatches,
  listCompanyTaxItems,
  listCompanyTaxpayerProfiles
} from "../tax/routes.js";
import { listCompanyVouchers } from "../vouchers/routes.js";
import {
  derivePayrollRuntimeSummary,
  derivePayrollTransferRuntimeSummary,
  deriveTaskRuntimeSummary,
  deriveTaxRuntimeSummary,
  deriveVoucherRuntimeSummary
} from "./summary.js";

function scopeTasks(req: ApiRequest, rows: Awaited<ReturnType<typeof listCompanyTasks>>) {
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (hasCompanyWideAccess(req.auth!.roleCodes)) {
    return companyRows;
  }
  return companyRows.filter(
    (row) =>
      row.ownerId === req.auth!.userId || row.assigneeDepartment === req.auth!.departmentName
  );
}

function findPayrollEventId(period: string, events: Awaited<ReturnType<typeof listCompanyEvents>>) {
  return (
    events.find(
      (event) =>
        event.type === "payroll" &&
        event.title === `${period} 工资计提与薪酬发放事项`
    )?.id ?? null
  );
}

export async function getTaskRuntimeSummaryRoute(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyTasks(req.auth!.companyId);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const filtered = eventId
    ? scopeTasks(req, rows).filter((item) => item.businessEventId === eventId)
    : scopeTasks(req, rows);
  return json(res, 200, {
    summary: deriveTaskRuntimeSummary(filtered, req.auth!.roleCodes)
  });
}

export async function getTaxRuntimeSummaryRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const batchId = url.searchParams.get("batchId");
  const businessEventId = url.searchParams.get("businessEventId");

  const [items, batches, profiles] = await Promise.all([
    listCompanyTaxItems(req.auth!.companyId, businessEventId ? { businessEventId } : {}),
    listCompanyTaxFilingBatches(req.auth!.companyId, batchId ?? undefined),
    listCompanyTaxpayerProfiles(req.auth!.companyId)
  ]);

  const selectedBatch = batchId
    ? batches.find((item) => item.id === batchId) ?? null
    : batches[0] ?? null;

  return json(res, 200, {
    summary: deriveTaxRuntimeSummary(items, batches, selectedBatch, profiles, req.auth!.roleCodes)
  });
}

export async function getVoucherRuntimeSummaryRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const businessEventId = url.searchParams.get("businessEventId");
  const voucherId = url.searchParams.get("voucherId");
  const vouchers = await listCompanyVouchers(req.auth!.companyId, businessEventId ? { businessEventId } : {});
  const detail = voucherId ? vouchers.find((item) => item.id === voucherId) ?? null : vouchers[0] ?? null;

  return json(res, 200, {
    summary: deriveVoucherRuntimeSummary(vouchers, detail, req.auth!.roleCodes)
  });
}

export async function getPayrollRuntimeSummaryRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? "";
  if (!period) {
    return json(res, 400, { error: "period is required" });
  }

  const [records, events] = await Promise.all([
    listCompanyPayrollRecords(req.auth!.companyId, period),
    listCompanyEvents(req.auth!.companyId)
  ]);
  const linkedEventId = findPayrollEventId(period, events);
  const [reviewLedgers, findings] = await Promise.all([
    listCompanyPayrollReviewLedgers(req.auth!.companyId, period),
    listCompanyRiskFindings(req.auth!.companyId)
  ]);
  const linkedRiskCount = linkedEventId
    ? findings.filter((item) => item.businessEventId === linkedEventId && item.status !== "resolved").length
    : 0;

  return json(res, 200, {
    summary: derivePayrollRuntimeSummary(
      period,
      records,
      linkedEventId,
      reviewLedgers,
      linkedRiskCount,
      req.auth!.roleCodes
    )
  });
}

export async function getPayrollTransferRuntimeSummaryRoute(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const batchId = url.searchParams.get("batchId");
  const batches = await listBatches(req.auth!.companyId);
  const selected = batchId ? await getBatchWithLines(req.auth!.companyId, batchId) : null;

  return json(res, 200, {
    summary: derivePayrollTransferRuntimeSummary(
      batches,
      selected?.batch ?? batches[0] ?? null,
      req.auth!.roleCodes
    )
  });
}
