/**
 * 成本中心的 HTTP 接线（V12-D1）。
 *
 * - `GET   /api/cost-centers`                 成本中心列表
 * - `POST  /api/cost-centers`                 新建
 * - `PATCH /api/cost-centers/:id`             停用 / 启用
 * - `GET   /api/reports/cost-centers?period=` 部门费用报表
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { fromCents } from "../../utils/money.js";
import { writeAudit } from "../../services/audit.js";
import {
  createCostCenter,
  listCostCenters,
  loadCostEntries,
  setCostCenterActive
} from "./cost-center-store.js";
import { buildCostCenterReport, describeUnassigned } from "./cost-center.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function listCostCentersRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listCostCenters(req.auth!.companyId, {
    // 管理页要能看到停用的才能重新启用；记账时的选择器不传这个参数
    includeInactive: url.searchParams.get("includeInactive") === "true"
  });
  json(res, 200, { items, total: items.length });
}

export async function createCostCenterRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await createCostCenter({
    companyId: req.auth!.companyId,
    code: typeof body.code === "string" ? body.code : "",
    name: typeof body.name === "string" ? body.name : "",
    departmentId: typeof body.departmentId === "string" ? body.departmentId : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : undefined
  });

  if (!result.ok) {
    json(res, result.failure.code === "COST_CENTER_CODE_DUPLICATE" ? 409 : 400, {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "cost_center.create",
    resourceType: "cost_center",
    resourceId: result.costCenter.id,
    resourceLabel: `${result.costCenter.code} ${result.costCenter.name}`,
    changes: { departmentId: result.costCenter.departmentId }
  });

  json(res, 201, result.costCenter);
}

export async function updateCostCenterRoute(
  req: ApiRequest,
  res: ServerResponse,
  costCenterId: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.isActive !== "boolean") {
    json(res, 400, { error: "isActive 必填（布尔）", code: "COST_CENTER_FIELDS_REQUIRED" });
    return;
  }

  const updated = await setCostCenterActive(req.auth!.companyId, costCenterId, body.isActive);
  if (!updated) {
    json(res, 404, { error: `找不到成本中心 ${costCenterId}`, code: "COST_CENTER_NOT_FOUND" });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: body.isActive ? "cost_center.activate" : "cost_center.deactivate",
    resourceType: "cost_center",
    resourceId: costCenterId,
    resourceLabel: costCenterId,
    changes: { isActive: body.isActive }
  });

  json(res, 200, { id: costCenterId, isActive: body.isActive });
}

export async function getCostCenterReportRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? "";
  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 必填，格式 YYYY-MM", code: "PERIOD_INVALID" });
    return;
  }

  const entries = await loadCostEntries(req.auth!.companyId, period);
  const report = buildCostCenterReport(period, entries);

  json(res, 200, {
    period: report.period,
    total: fromCents(report.totalCents),
    unassigned: fromCents(report.unassignedCents),
    // 未指定的提示随报表一起给，不需要前端自己算比例判阈值
    unassignedNotice: describeUnassigned(report),
    rows: report.rows.map((row) => ({
      costCenterId: row.costCenterId,
      costCenterName: row.costCenterName,
      total: fromCents(row.totalCents),
      share: Number(row.share.toFixed(4)),
      accounts: row.accounts.map((account) => ({
        accountCode: account.accountCode,
        accountName: account.accountName,
        amount: fromCents(account.amountCents)
      }))
    }))
  });
}
